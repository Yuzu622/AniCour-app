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
        const [subRaw, syncRaw] = await Promise.all([
          redisRequest(["GET", `anicour:push:${code}`]),
          redisRequest(["GET", `anicour:sync:${code}`]),
        ]);
        if (!subRaw || !syncRaw) {
          if (debug) debugInfo.push({ code, hasSub: !!subRaw, hasSync: !!syncRaw });
          continue;
        }

        const subscription = JSON.parse(subRaw);
        const syncData = JSON.parse(syncRaw);
        const selected = syncData.selected || [];
        const notify = syncData.notify || {};

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

            const payload = JSON.stringify({
              title: `まもなく放送: ${option.title}`,
              body: `${option.chName} ${airing.key.split("T")[1]}〜${airing.episode ? ` (第${airing.episode}話)` : ""}`,
            });

            try {
              await webpush.sendNotification(subscription, payload);
              sent++;
            } catch (sendErr) {
              errors++;
              // 購読が無効になっている(端末側で通知オフ・アンインストール等)場合は掃除する
              if (sendErr.statusCode === 404 || sendErr.statusCode === 410) {
                await redisRequest(["DEL", `anicour:push:${code}`]);
                await redisRequest(["SREM", "anicour:push:codes", code]);
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
