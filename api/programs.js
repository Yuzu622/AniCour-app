// Vercel Serverless Function: /api/programs
// しょぼいカレンダー(cal.syoboi.jp)から放送予定を取得し、
// 「作品ごと・視聴方法ごと」に整理してフロントエンドへ返す。

const UA = "AnimeCourApp/0.1 (personal project; individual use)";

let cache = { data: null, ts: 0 };
const CACHE_MS = 10 * 60 * 1000; // 10分キャッシュ(同じサーバーインスタンスが温かい間だけ有効)

function pad(n) {
  return String(n).padStart(2, "0");
}

function todayJstStr() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
}

function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// しょぼいカレンダーの時刻表記(Unixタイムスタンプ・秒)をDateに変換
function parseSyoboiTime(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const digits = String(raw).replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) {
    const date = new Date(Number(digits) * 1000);
    return isNaN(date.getTime()) ? null : date;
  }
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
  return Array.isArray(x) ? x : Object.values(x);
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

async function fetchJson(url) {
  // 途中のキャッシュ(CDNなど)で古い/同じ結果が返り続けるのを避けるための対策
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
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("しょぼいカレンダーの応答がJSONとして解釈できませんでした");
  }
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function handler(req, res) {
  try {
    const debug = req.query && (req.query.debug === "1" || req.query.debug === "true");

    if (!debug && cache.data && Date.now() - cache.ts < CACHE_MS) {
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).json(cache.data);
    }

    // 9日分を3日ずつ3回に分けて取得(1回のリクエストが大きくなりすぎて
    // しょぼいカレンダー側で切られてしまうのを避けるため)。
    // 同時に投げると弾かれる可能性があるため、1つずつ順番にリクエストする。
    const start0 = todayJstStr();
    const starts = [start0, addDaysStr(start0, 3), addDaysStr(start0, 6)];

    const chunkResults = [];
    for (const s of starts) {
      const r = await fetchJson(`https://cal.syoboi.jp/json.php?Req=ProgramByDate&Start=${s}&Days=3`);
      chunkResults.push(r);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    const chunkProgramCounts = chunkResults.map((r) => toArray(r.Programs).length);

    // 各回で実際に取れた日付の範囲(本当に異なるデータが返ってきているかの確認用)
    const chunkDateRanges = chunkResults.map((r) => {
      const times = toArray(r.Programs)
        .map((p) => parseSyoboiTime(p.StTime))
        .filter(Boolean)
        .map((d) => d.getTime());
      if (times.length === 0) return null;
      const { day: minDay, hour: minHour, minute: minMin } = getJstParts(new Date(Math.min(...times)));
      const { day: maxDay, hour: maxHour, minute: maxMin } = getJstParts(new Date(Math.max(...times)));
      return {
        min: `${["月","火","水","木","金","土","日"][minDay]} ${minHour}:${pad(minMin)}`,
        max: `${["月","火","水","木","金","土","日"][maxDay]} ${maxHour}:${pad(maxMin)}`,
      };
    });

    // PIDで重複排除しつつ全プログラムをまとめる
    const programMap = new Map();
    for (const chunk of chunkResults) {
      for (const p of toArray(chunk.Programs)) {
        if (p && p.PID) programMap.set(p.PID, p);
      }
    }
    const programs = Array.from(programMap.values());

    // 出てきた作品(TID)ぶんだけタイトル名をまとめて取得
    const uniqueTids = Array.from(new Set(programs.map((p) => p.TID).filter(Boolean)));
    const tidBatches = chunkArray(uniqueTids, 150);
    const titleResults = await Promise.all(
      tidBatches.map((batch) => fetchJson(`https://cal.syoboi.jp/json.php?Req=TitleMedium&TID=${batch.join(",")}`))
    );
    const titlesRaw = {};
    for (const r of titleResults) {
      const arr = toArray(r.Titles);
      for (const t of arr) {
        if (t && t.TID) titlesRaw[t.TID] = t;
      }
      // オブジェクト形式(TIDキー)の場合にも対応
      if (r.Titles && !Array.isArray(r.Titles)) {
        Object.assign(titlesRaw, r.Titles);
      }
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
      const stTime = parseSyoboiTime(p.StTime);
      if (!stTime) {
        skippedBadTime++;
        continue;
      }

      const titleInfo = titlesRaw[tid] || titlesRaw[String(tid)];
      const title = (titleInfo && (titleInfo.Title || titleInfo.ShortTitle)) || `不明の作品(TID:${tid})`;

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
      return res.status(200).json({
        starts,
        chunkProgramCounts,
        chunkDateRanges,
        totalRawPrograms: programs.length,
        uniqueTidCount: uniqueTids.length,
        titleBatchCount: tidBatches.length,
        titlesFetchedCount: Object.keys(titlesRaw).length,
        skippedMissingIds,
        skippedBadTime,
        finalItemCount: items.length,
        sampleTitles: items.slice(0, 15).map((a) => a.title),
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
