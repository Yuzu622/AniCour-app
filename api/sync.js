// Vercel Serverless Function: /api/sync
// 「合言葉(コード)」1つにつき、選択状態(selected/notify/colorOverrides)を1件だけ保存する
// ごく簡易な複数端末同期の仕組み。認証などはなく、コードを知っていれば誰でも読み書きできる
// 前提(個人利用の想定)。保存先はUpstash Redis(REST API)。

function getUpstashConfig() {
  // Vercel Marketplace経由のUpstash連携で使われがちな環境変数名をいくつか試す
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_TOKEN;
  return { url, token };
}

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字(0/O/1/I)を除外
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function redisCommand(url, token, command) {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!resp.ok) {
    throw new Error(`Redisへの接続に失敗しました (status ${resp.status})`);
  }
  return resp.json();
}

const TTL_SECONDS = 60 * 60 * 24 * 180; // 180日間アクセスがなければ自動で消える

export default async function handler(req, res) {
  const { url, token } = getUpstashConfig();

  if (!url || !token) {
    return res.status(500).json({
      error:
        "同期用のデータベースが接続されていません。VercelのStorageタブからUpstash(Redis)を接続してください。",
    });
  }

  try {
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      let { code, data } = body;

      if (!data) {
        return res.status(400).json({ error: "保存するデータがありません" });
      }

      if (!code) {
        // コード未指定 = 新規発行
        code = randomCode();
      }
      code = String(code).toUpperCase();

      const payload = JSON.stringify({ data, updatedAt: new Date().toISOString() });
      await redisCommand(url, token, ["SET", `anicour:${code}`, payload, "EX", TTL_SECONDS]);

      return res.status(200).json({ code });
    }

    if (req.method === "GET") {
      const code = String(req.query.code || "").toUpperCase();
      if (!code) return res.status(400).json({ error: "コードが指定されていません" });

      const result = await redisCommand(url, token, ["GET", `anicour:${code}`]);
      if (!result || !result.result) {
        return res.status(404).json({ error: "そのコードのデータが見つかりませんでした" });
      }
      const parsed = JSON.parse(result.result);
      return res.status(200).json(parsed);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "許可されていないメソッドです" });
  } catch (e) {
    return res.status(500).json({ error: "通信エラーが発生しました: " + (e && e.message ? e.message : String(e)) });
  }
}
