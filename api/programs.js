// Vercel Serverless Function: /api/programs
// しょぼいカレンダー(cal.syoboi.jp)の rss2.php (alt=json) から
// 向こう7日分の放送予定を1回のリクエストで取得し、
// 「作品ごと・視聴方法ごと」に整理してフロントエンドへ返す。
//
// json.php の ProgramByDate は実質「常に現在時刻からの直近~124件」しか
// 返さない制約があったため使用をやめ、行数制限のない rss2.php に切り替えている。

const UA = "AnimeCourApp/0.1 (personal project; individual use)";

// しょぼいカレンダーのユーザーID。このユーザーが「表示する」設定にしている
// チャンネル(ローカル局を含む)を反映してデータを取得するために使う。
const USR_ID = "pScwFmb5Ya";

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

// 日本時間での "YYYY-MM-DD"
function jstDateStr(date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
}

function toArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === "object") return Object.values(x);
  return [];
}

// チャンネル名とチャンネルURLからカテゴリ(地上波/BS/CS/配信)と、配信の場合はサービス名を推測
// ChURL(配信サービスの実際のドメイン)を優先して判定し、名前だけでの誤判定(MBSがBS判定されるなど)を防ぐ
function classify(chName, chUrl) {
  const s = String(chName || "");
  const u = String(chUrl || "");

  // 1. URLドメインでの判定(最も確実。ABEMAのジャンル別チャンネルなど、
  //    名前だけでは配信サービスと分からないものもここで拾える)
  const urlServiceMap = [
    [/abema\.tv/i, "ABEMA"],
    [/netflix\.com/i, "Netflix"],
    [/anime\.dmkt-sp\.jp|danime/i, "dアニメストア"],
    [/amazon\.co\.jp|primevideo/i, "Prime Video"],
    [/hulu\.jp/i, "Hulu"],
    [/unext\.jp/i, "U-NEXT"],
    [/disneyplus\.com/i, "Disney+"],
    [/nicovideo\.jp|nico\.ms/i, "ニコニコ"],
    [/fod\.fujitv/i, "FOD"],
    [/lemino\.docomo/i, "Lemino"],
    [/dmm\.com/i, "DMM TV"],
    [/youtube\.com/i, "YouTube"],
    [/tver\.jp/i, "TVer"],
  ];
  for (const [re, name] of urlServiceMap) {
    if (re.test(u)) return { category: "streaming", provider: name };
  }

  // 2. チャンネル名での判定(BSは「MBS」のような地上波局名を誤検出しないよう、
  //    名前が"BS"で始まるものだけに限定する)
  if (/^BS/i.test(s) || /^NHK\s*BS/i.test(s)) return { category: "bs", provider: null };
  if (/AT-?X/i.test(s)) return { category: "cs", provider: null };
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
    [/YouTube/i, "YouTube"],
    [/TVer/i, "TVer"],
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
    const fresh = req.query && (req.query.fresh === "1" || req.query.fresh === "true");

    if (!debug && !fresh && cache.data && Date.now() - cache.ts < CACHE_MS) {
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).json(cache.data);
    }

    const start = nowJstStartParam();
    const url = `https://cal.syoboi.jp/rss2.php?start=${start}&days=14&alt=json&usr=${USR_ID}&filter=0`;
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
        grouped.set(tid, { id: String(tid), title, options: new Map(), minEpisode: null });
      }
      const entry = grouped.get(tid);

      // 話数は Count フィールドにそのまま数値で入っている(SubTitleは話のサブタイトル文なので使わない)。
      // 「今クールの新番組かどうか」の推測にも使う。
      const countNum = Number(p.Count);
      const epNum = Number.isInteger(countNum) && countNum > 0 ? countNum : null;
      if (epNum !== null && (entry.minEpisode === null || epNum < entry.minEpisode)) {
        entry.minEpisode = epNum;
      }

      if (!entry.options.has(chId)) {
        const { day, hour, minute } = getJstParts(stTime);
        const time = `${hour}:${pad(minute)}`;
        const chName = p.ChName || "不明チャンネル";
        const { category, provider } = classify(chName, p.ChURL);
        entry.options.set(chId, { id: `${tid}-${chId}`, chName, category, provider, day, time, airings: [] });
      }

      // このチャンネルで実際に確認できた放送日時を(重複を除いて)ためていく。
      // カレンダー表示は「曜日の繰り返し」ではなく、この実データの日付だけを使う。
      const opt = entry.options.get(chId);
      const dateStr = jstDateStr(stTime);
      const { hour: ah, minute: am } = getJstParts(stTime);
      const airingKey = `${dateStr}T${pad(ah)}:${pad(am)}`;
      if (!opt.airings.some((a) => a.key === airingKey)) {
        opt.airings.push({ key: airingKey, episode: epNum });
      }
    }

    for (const entry of grouped.values()) {
      for (const opt of entry.options.values()) {
        opt.airings.sort((a, b) => (a.key > b.key ? 1 : -1));
      }
    }

    const items = Array.from(grouped.values())
      .map((a) => ({
        id: a.id,
        title: a.title,
        // 話数の最小値が1〜2話なら「今クールの新番組らしい」とみなす(推測のため完璧ではない)
        isNew: a.minEpisode !== null && a.minEpisode <= 2,
        options: Array.from(a.options.values()),
      }))
      .filter((a) => a.options.length > 0)
      .sort((a, b) => a.title.localeCompare(b.title, "ja"));

    if (debug) {
      const q = req.query && req.query.q;
      const allChannelNames = Array.from(new Set(programs.map((p) => p.ChName).filter(Boolean))).sort();
      const matched = q
        ? programs
            .filter((p) => String(p.Title || "").includes(q))
            .map((p) => ({
              Title: p.Title,
              ChName: p.ChName,
              ChURL: p.ChURL,
              ChID: p.ChID,
              TID: p.TID,
              StTime: p.StTime,
              SubTitle: p.SubTitle,
              SubTitle2: p.SubTitle2,
              Count: p.Count,
            }))
        : null;
      const allTimes = programs.map((p) => parseEpochSeconds(p.StTime)).filter(Boolean).map((d) => d.getTime());
      const latestCoveredDate = allTimes.length ? new Date(Math.max(...allTimes)).toISOString() : null;
      return res.status(200).json({
        requestUrl: url,
        rawIsArray: Array.isArray(raw),
        rawTopLevelKeys: Array.isArray(raw) ? null : Object.keys(raw || {}),
        totalRawPrograms: programs.length,
        skippedMissingIds,
        skippedBadTime,
        finalItemCount: items.length,
        latestCoveredDate,
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
