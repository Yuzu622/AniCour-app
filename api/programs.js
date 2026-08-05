// Vercel Serverless Function: /api/programs
// しょぼいカレンダー(cal.syoboi.jp)から向こう数日分の放送予定を取得し、
// 「作品ごと・視聴方法ごと」に整理してフロントエンドへ返す。

let cache = { data: null, ts: 0 };
const CACHE_MS = 10 * 60 * 1000; // 10分キャッシュ(同じサーバーインスタンスが温かい間だけ有効)

function pad(n) {
  return String(n).padStart(2, "0");
}

// しょぼいカレンダーの時刻表記をDateに変換
// 実際にはUnixタイムスタンプ(秒)で返ってくる(例: "1785835800")
function parseSyoboiTime(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const digits = String(raw).replace(/\D/g, "");

  // 10桁 = Unixタイムスタンプ(秒)
  if (/^\d{10}$/.test(digits)) {
    const date = new Date(Number(digits) * 1000);
    return isNaN(date.getTime()) ? null : date;
  }

  // 念のため YYYYMMDDHHmmss 形式(14桁)にも対応
  if (digits.length >= 14) {
    const y = digits.slice(0, 4);
    const mo = digits.slice(4, 6);
    const d = digits.slice(6, 8);
    const h = digits.slice(8, 10);
    const mi = digits.slice(10, 12);
    const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:00+09:00`);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function toArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : Object.values(x);
}

// チャンネル名から大まかなカテゴリを推測(地上波/BS/CS/配信)
function classify(chName) {
  const s = String(chName || "");
  if (/BS/i.test(s)) return "bs";
  if (/AT-?X|CS/i.test(s)) return "cs";
  if (/dアニメ|Netflix|Hulu|Prime|ABEMA|U-?NEXT|Disney|ニコニコ|FOD|Lemino/i.test(s)) return "streaming";
  return "chijou";
}

export default async function handler(req, res) {
  try {
    const debug = req.query && (req.query.debug === "1" || req.query.debug === "true");

    if (!debug && cache.data && Date.now() - cache.ts < CACHE_MS) {
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).json(cache.data);
    }

    const now = new Date();
    const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const days = 9;

    const url = `https://cal.syoboi.jp/json.php?Req=ProgramByDate,TitleMedium&Start=${start}&Days=${days}`;

    const resp = await fetch(url, {
      headers: {
        // しょぼいカレンダーのルールに従い、独自のUser-Agentを設定
        "User-Agent": "AnimeCourApp/0.1 (personal project; individual use)",
        Accept: "application/json,text/plain,*/*",
      },
    });

    const rawText = await resp.text();

    if (debug) {
      // 実際に返ってきた内容をそのまま確認するための調査モード
      return res.status(200).json({
        requestUrl: url,
        httpStatus: resp.status,
        contentType: resp.headers.get("content-type"),
        bodyPreview: rawText.slice(0, 1500),
        bodyLength: rawText.length,
      });
    }

    if (!resp.ok) {
      return res.status(502).json({ error: `しょぼいカレンダーの応答エラー (status ${resp.status})` });
    }

    let raw;
    try {
      raw = JSON.parse(rawText);
    } catch (e) {
      return res.status(502).json({ error: "しょぼいカレンダーの応答がJSONとして解釈できませんでした" });
    }

    const programs = toArray(raw.Programs);
    const titlesRaw = raw.Titles || {};

    const grouped = new Map(); // TID -> { id, title, options: Map(ChID -> option) }

    for (const p of programs) {
      const tid = p.TID;
      const chId = p.ChID;
      const stTime = parseSyoboiTime(p.StTime);
      if (!tid || !chId || !stTime) continue;

      const titleInfo = titlesRaw[tid] || titlesRaw[String(tid)];
      const title =
        (titleInfo && (titleInfo.Title || titleInfo.ShortTitle)) || `不明の作品(TID:${tid})`;

      if (!grouped.has(tid)) {
        grouped.set(tid, { id: String(tid), title, options: new Map() });
      }
      const entry = grouped.get(tid);

      // 同じ局(ChID)の放送は9日間の中で複数回ヒットしうるので、最初の1件だけを代表として採用
      if (!entry.options.has(chId)) {
        const day = (stTime.getDay() + 6) % 7; // 0=月 ... 6=日 に変換
        const time = `${pad(stTime.getHours())}:${pad(stTime.getMinutes())}`;
        const chName = p.ChName || "不明チャンネル";
        entry.options.set(chId, {
          id: `${tid}-${chId}`,
          chName,
          category: classify(chName),
          day,
          time,
        });
      }
    }

    const items = Array.from(grouped.values())
      .map((a) => ({ id: a.id, title: a.title, options: Array.from(a.options.values()) }))
      .filter((a) => a.options.length > 0)
      .sort((a, b) => a.title.localeCompare(b.title, "ja"));

    const payload = { updatedAt: new Date().toISOString(), items };
    cache = { data: payload, ts: Date.now() };

    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: "取得中にエラーが発生しました: " + (e && e.message ? e.message : String(e)) });
  }
}
