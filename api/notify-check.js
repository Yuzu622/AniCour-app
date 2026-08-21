// Vercel Serverless Function: /api/notify-check
// 外部の無料スケジューラ(cron-job.orgなど)から数分おきに呼び出してもらう想定のエンドポイント。
// 各「合言葉」ごとに、通知ONにしている作品の次回放送が「まもなく(8〜13分後)」なら
// プッシュ通知を送る。1回の放送につき二重送信しないよう、送信済みフラグをRedisに残す。

import webpush from "web-push";
import { getProgramPayload } from "./_lib/getPrograms.js";

function getRedisConfig() {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_API_TOKEN;
  return { url, token };
}

async function redisRequest(command) {
  const { url, token } = getRedisConfig();
  if (!url || !token) throw new Error("Redis未接続");
  const resp = await fetch(`${url}/${command.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

// SET key value NX EX seconds --> 成功時"OK"、既にあれば null(=送信済みという意味に使う)
async function setIfNotExists(key, seconds) {
  const result = await redisRequest(["SET", key, "1", "NX", "EX", String(seconds)]);
  return result === "OK";
}

// 合言葉に紐づく購読情報を全端末ぶん取得する。[{endpoint, subscription}, ...] の形で返す。
// 以前のバージョンの名残で「1件だけの文字列」形式が残っている場合にも対応する。
async function getSubscriptions(code) {
  const key = `anicour:push:${code}`;
  try {
    const raw = await redisRequest(["HGETALL", key]);
    const pairs = [];
    if (Array.isArray(raw)) {
      for (let i = 0; i < raw.length; i += 2) {
        pairs.push([raw[i], raw[i + 1]]);
      }
    } else if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) pairs.push([k, v]);
    }
    return pairs
      .map(([endpoint, value]) => {
        try {
          return { endpoint, subscription: JSON.parse(value) };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    // 型が違う(以前の文字列形式)場合はそのまま1件として読む
    try {
      const raw = await redisRequest(["GET", key]);
      if (!raw) return [];
      const subscription = JSON.parse(raw);
      return [{ endpoint: subscription.endpoint, subscription }];
    } catch (e2) {
      return [];
    }
  }
}

export default async function handler(req, res) {
  // 誰でも叩けるとスパムや無駄な実行の元になるので、秘密のクエリパラメータで簡易的に保護する
  const secret = req.query.secret;
  if (!process.env.NOTIFY_CRON_SECRET || secret !== process.env.NOTIFY_CRON_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || "mailto:example@example.com";
    if (!vapidPublic || !vapidPrivate) {
      return res.status(500).json({ error: "VAPIDキーが未設定です" });
    }
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const codes = (await redisRequest(["SMEMBERS", "anicour:push:codes"])) || [];
    if (codes.length === 0) {
      return res.status(200).json({ checked: 0, sent: 0, message: "購読なし" });
    }

    // 以前はここで自分自身の /api/programs をHTTPで呼び出していたが、
    // Vercelの保護つきURL経由だとHTMLが返ってきてJSON解析に失敗することがあったため、
    // 共通モジュールを直接呼び出す形に変更した(キャッシュも共有される)
    const programsData = await getProgramPayload();
    const animeList = programsData.items || [];
    const optionById = new Map();
    for (const a of animeList) {
      for (const o of a.options) {
        optionById.set(o.id, { ...o, title: a.title });
      }
    }

    const now = Date.now();
    let sent = 0;
    let errors = 0;
    const debug = req.query && (req.query.debug === "1" || req.query.debug === "true");
    const debugInfo = [];

    for (const code of codes) {
      try {
        const [subs, syncRaw] = await Promise.all([getSubscriptions(code), redisRequest(["GET", `anicour:${code}`])]);
        if (subs.length === 0 || !syncRaw) {
          if (debug) debugInfo.push({ code, subCount: subs.length, hasSync: !!syncRaw });
          continue;
        }

        const syncPayload = JSON.parse(syncRaw);
        const syncData = syncPayload.data || syncPayload; // {data:{...}} 形式・素の形式どちらでも読めるようにする
        const selected = syncData.selected || [];
        const notify = syncData.notify || {};

        // まず「送るべき通知」をこの合言葉ぶん1回だけ組み立て、登録されている全端末に配る
        const toSend = [];
        for (const optionId of selected) {
          if (!notify[optionId]) continue;
          const option = optionById.get(optionId);
          if (!option || !option.airings) {
            if (debug) debugInfo.push({ code, optionId, found: false });
            continue;
          }

          for (const airing of option.airings) {
            const airTime = new Date(`${airing.key}:00+09:00`).getTime();
            const diffMin = Math.round((airTime - now) / 60000);
            const inWindow = diffMin >= 8 && diffMin <= 13;

            if (debug) {
              debugInfo.push({
                code,
                optionId,
                title: option.title,
                chName: option.chName,
                airingKey: airing.key,
                diffMin,
                inWindow,
              });
            }

            // 8〜13分後に始まるものだけ対象(外部cronが5分おき想定なので取りこぼしにくい幅にしている)
            if (!inWindow) continue;

            const dedupeKey = `anicour:notified:${code}:${optionId}:${airing.key}`;
            const isFirstTime = debug ? true : await setIfNotExists(dedupeKey, 60 * 60);
            if (!isFirstTime) continue;
            if (debug) continue; // debug時は実際には送らない

            toSend.push({
              title: `まもなく放送: ${option.title}`,
              body: `${option.chName} ${airing.key.split("T")[1]}〜${airing.episode ? ` (第${airing.episode}話)` : ""}`,
            });
          }
        }

        if (toSend.length === 0) continue;

        // 登録されている端末すべてに送信する
        for (const { endpoint, subscription } of subs) {
          for (const notification of toSend) {
            try {
              await webpush.sendNotification(subscription, JSON.stringify(notification));
              sent++;
            } catch (sendErr) {
              errors++;
              // その端末の購読が無効になっている(通知オフ・アンインストール等)場合は、その端末ぶんだけ掃除する
              if (sendErr.statusCode === 404 || sendErr.statusCode === 410) {
                try {
                  await redisRequest(["HDEL", `anicour:push:${code}`, endpoint]);
                } catch (cleanupErr) {
                  // noop
                }
              }
            }
          }
        }
      } catch (innerErr) {
        errors++;
      }
    }

    if (debug) {
      return res.status(200).json({ checked: codes.length, now: new Date(now).toISOString(), debugInfo });
    }
    return res.status(200).json({ checked: codes.length, sent, errors });
  } catch (e) {
    return res.status(500).json({ error: "通知チェックエラー: " + (e && e.message ? e.message : String(e)) });
  }
}
