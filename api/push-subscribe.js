// Vercel Serverless Function: /api/push-subscribe
// ブラウザのプッシュ購読情報(subscription)を、同期用の合言葉(code)に紐づけて保存する。
// 1つの合言葉につき複数端末ぶん登録できるよう、Redisの「ハッシュ」構造を使う
// (フィールド名 = 購読のendpoint、値 = 購読情報のJSON)。
//
// 通知チェック(api/notify-check.js)は、この合言葉ごとに「どの作品を通知ONにしているか」を
// api/sync.js に保存されたデータから読み取って判断する。

function getRedisConfig() {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_API_TOKEN;
  return { url, token };
}

async function redisRequest(command) {
  const { url, token } = getRedisConfig();
  if (!url || !token) {
    throw new Error("ストレージ(Upstash for Redis)がこのプロジェクトに接続されていません。");
  }
  const resp = await fetch(`${url}/${command.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

function normalizeCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\-_]/g, "");
}

// 以前のバージョンでは1端末ぶんの購読情報を文字列(SET)で保存していたため、
// 同じキーに対して今回のハッシュ(HSET)を使おうとすると型が違ってエラーになることがある。
// その場合はキーを作り直してから保存し直す(自己修復)。
async function hsetWithRecovery(key, field, value) {
  try {
    await redisRequest(["HSET", key, field, value]);
  } catch (e) {
    await redisRequest(["DEL", key]);
    await redisRequest(["HSET", key, field, value]);
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const { code, subscription } = req.body || {};
      const c = normalizeCode(code);
      if (!c || c.length < 4) {
        return res.status(400).json({ error: "合言葉が正しくありません(先に同期パネルで発行してください)" });
      }
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: "購読情報が正しくありません" });
      }
      await hsetWithRecovery(`anicour:push:${c}`, subscription.endpoint, JSON.stringify(subscription));
      await redisRequest(["SADD", "anicour:push:codes", c]);
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const c = normalizeCode(req.query.code);
      const endpoint = req.query.endpoint;
      if (!c) return res.status(400).json({ error: "code が必要です" });

      if (endpoint) {
        // この端末の購読だけを削除する
        try {
          await redisRequest(["HDEL", `anicour:push:${c}`, endpoint]);
          const remaining = await redisRequest(["HLEN", `anicour:push:${c}`]);
          if (!remaining) await redisRequest(["SREM", "anicour:push:codes", c]);
        } catch (e) {
          // 型不一致など(古い形式のデータ)の場合はキーごと削除して掃除する
          await redisRequest(["DEL", `anicour:push:${c}`]);
          await redisRequest(["SREM", "anicour:push:codes", c]);
        }
      } else {
        // endpoint指定なし = この合言葉の購読を全部削除(後方互換)
        await redisRequest(["DEL", `anicour:push:${c}`]);
        await redisRequest(["SREM", "anicour:push:codes", c]);
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "許可されていないメソッドです" });
  } catch (e) {
    return res.status(500).json({ error: "保存エラー: " + (e && e.message ? e.message : String(e)) });
  }
}
