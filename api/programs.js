// Vercel Serverless Function: /api/programs
// しょぼいカレンダー(cal.syoboi.jp)の rss2.php (alt=json) から
// 向こう7日分の放送予定を1回のリクエストで取得し、
// 「作品ごと・視聴方法ごと」に整理してフロントエンドへ返す。
//
// json.php の ProgramByDate は実質「常に現在時刻からの直近~124件」しか
// 返さない制約があったため使用をやめ、行数制限のない rss2.php に切り替えている。

const UA = "AnimeCourApp/0.1 (personal project; individual use)";

let cache = { data: null, ts: 0 };
const CACHE_MS = 10 * 60 * 1000;

function pad(n) {
  return String(n).padStart(2, "0");
}

// 日本時間での "YYYYMMDDhhmm" (rss2.phpのstartパラメータ形式)
function nowJstStartParam() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return (
    `${jst.getUTCFullYear()}${pad(jst.getUTCMonth() + 1)}${pad(jst.getUTCDate())}` +
    `${pad(jst.getUTCHours())}${pad(jst.getUTCMinutes())}`
  );
}

// StTimeU / EdTimeU (Unix epoch秒) をDateに変換
function parseEpochSeconds(raw) {
  const n = Number(raw);
  if (!n || isNaN(n)) return null;
  const date = new Date(n * 1000);
  return isNaN(date.getTime()) ? null : date;
}

// UTCのDateから「日本時間での」曜日・時・分を取り出す(サーバーのタイムゾーン設定に依存しない)
function getJstParts(date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const day = (jst.getUTCDay() + 6) % 7; // 0=月 ... 6=日
  const hour = jst.getUTCHours();
  const minute = jst.getUTCMinutes();
  return { day, hour, minute };
}

function toArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === "object") return Object.values(x);
  return [];
}

// チャンネル名からカテゴリ(地上波/BS/CS/配信)と、配信の場合はサービス名を推測
function classify(chName) {
  const s = String(chName || "");
  if (/AT-?X/i.test(s)) return { category: "cs", provider: null };
  if (/BS/i.test(s)) return { category: "bs", provider: null };
  if (/\bCS\b/i.test(s)) return { category: "cs", provider: null };

  const streamMap = [
    [/ABEMA/i, "ABEMA"],
    [/dアニメ/i, "dアニメストア"],
    [/Netflix/i, "Netflix"],
    [/Hulu/i, "Hulu"],
    [/Prime|アマゾン|Amazon/i, "Prime Video"],
    [/U-?NEXT/i, "U-NEXT"],
    [/Disney/i, "Disney+"],
    [/ニコニコ/i, "ニコニコ"],
    [/FOD/i, "FOD"],
    [/Lemino/i, "Lemino"],
    [/DMM/i, "DMM TV"],
    [/アニメ*ライブ|アニメLIVE/i, "アニメLIVE"],
  ];
  for (const [re, name] of streamMap) {
    if (re.test(s)) return { category: "streaming", provider: name };
  }
  return { category: "chijou", provider: null };
}

async function fetchRaw(url) {
  const bustedUrl = url + (url.includes("?") ? "&" : "?") + "_=" + Date.now() + Math.random().toString(36).slice(2);
  const resp = await fetch(bustedUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json,text/plain,*/*",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    cache: "no-store",
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`しょぼいカレンダー応答エラー (status ${resp.status})`);
  }
  return text;
}

export default async function handler(req, res) {
  try {
    const debug = req.query && (req.query.debug === "1" || req.query.debug === "true");

    if (!debug && cache.data && Date.now() - cache.ts < CACHE_MS) {
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).json(cache.data);
    }

    const start = nowJstStartParam();
    const url = `https://cal.syoboi.jp/rss2.php?start=${start}&days=7&alt=json`;
    const rawText = await fetchRaw(url);

    let raw;
    try {
      raw = JSON.parse(rawText);
    } catch (e) {
      return res.status(502).json({
        error: "しょぼいカレンダーの応答がJSONとして解釈できませんでした",
        bodyPreview: rawText.slice(0, 800),
      });
    }

    // レスポンスは { items: [...], chInfo: {...} } という形で返ってくる
    let programs = [];
    if (Array.isArray(raw)) {
      programs = raw;
    } else if (raw && Array.isArray(raw.items)) {
      programs = raw.items;
    } else if (raw && typeof raw === "object") {
      programs = toArray(raw.Programs || raw.programs);
    }

    let skippedMissingIds = 0;
    let skippedBadTime = 0;

    const grouped = new Map(); // TID -> { id, title, options: Map(ChID -> option) }

    for (const p of programs) {
      const tid = p.TID;
      const chId = p.ChID;
      if (!tid || !chId) {
        skippedMissingIds++;
        continue;
      }
      const stTime = parseEpochSeconds(p.StTime);
      if (!stTime) {
        skippedBadTime++;
        continue;
      }

      const title = p.Title || p.ShortTitle || `不明の作品(TID:${tid})`;

      if (!grouped.has(tid)) {
        grouped.set(tid, { id: String(tid), title, options: new Map() });
      }
      const entry = grouped.get(tid);

      if (!entry.options.has(chId)) {
        const { day, hour, minute } = getJstParts(stTime);
        const time = `${hour}:${pad(minute)}`;
        const chName = p.ChName || "不明チャンネル";
        const { category, provider } = classify(chName);
        entry.options.set(chId, { id: `${tid}-${chId}`, chName, category, provider, day, time });
      }
    }

    const items = Array.from(grouped.values())
      .map((a) => ({ id: a.id, title: a.title, options: Array.from(a.options.values()) }))
      .filter((a) => a.options.length > 0)
      .sort((a, b) => a.title.localeCompare(b.title, "ja"));

    if (debug) {
      const q = req.query && req.query.q;
      const allChannelNames = Array.from(new Set(programs.map((p) => p.ChName).filter(Boolean))).sort();
      const matched = q
        ? programs
            .filter((p) => String(p.Title || "").includes(q))
            .map((p) => ({ Title: p.Title, ChName: p.ChName, ChID: p.ChID, TID: p.TID, StTime: p.StTime }))
        : null;
      return res.status(200).json({
        requestUrl: url,
        rawIsArray: Array.isArray(raw),
        rawTopLevelKeys: Array.isArray(raw) ? null : Object.keys(raw || {}),
        totalRawPrograms: programs.length,
        skippedMissingIds,
        skippedBadTime,
        finalItemCount: items.length,
        sampleTitles: items.slice(0, 20).map((a) => a.title),
        allChannelNames,
        allChannelNameCount: allChannelNames.length,
        matchedForQuery: matched,
      });
    }

    const payload = { updatedAt: new Date().toISOString(), items };
    cache = { data: payload, ts: Date.now() };

    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: "取得中にエラーが発生しました: " + (e && e.message ? e.message : String(e)) });
  }
}
