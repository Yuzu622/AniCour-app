// api/_lib/getPrograms.js
// しょぼいカレンダーからのデータ取得・整形ロジックの本体。
// 先頭が "_" のファイル/フォルダはVercelのAPI Routesとして扱われないため、
// これ自体は外部から直接呼び出されるエンドポイントにはならない(内部共通処理専用)。
//
// api/programs.js と api/notify-check.js の両方がここを直接importして使う。
// 以前は notify-check.js が自分自身の /api/programs をHTTPで再度呼び出す実装にしていたが、
// その呼び出し先がVercelの保護つきURLに当たるとHTMLが返ってきてJSON解析に失敗する問題があったため、
// HTTPを介さずこのモジュールを直接呼ぶ形に変更した。

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

// StTime (Unix epoch秒) をDateに変換
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

// しょぼいカレンダーへ実際にリクエストし、生データ(programs配列)を返す
export async function fetchRawPrograms() {
  const start = nowJstStartParam();
  const url = `https://cal.syoboi.jp/rss2.php?start=${start}&days=14&alt=json&usr=${USR_ID}&filter=0`;
  const rawText = await fetchRaw(url);

  let raw;
  try {
    raw = JSON.parse(rawText);
  } catch (e) {
    const err = new Error("しょぼいカレンダーの応答がJSONとして解釈できませんでした");
    err.bodyPreview = rawText.slice(0, 800);
    throw err;
  }

  let programs = [];
  if (Array.isArray(raw)) {
    programs = raw;
  } else if (raw && Array.isArray(raw.items)) {
    programs = raw.items;
  } else if (raw && typeof raw === "object") {
    programs = toArray(raw.Programs || raw.programs);
  }

  return { raw, programs, url };
}

// programs配列(生データ)を「作品ごと・視聴方法ごと」に整形する
export function buildItems(programs) {
  let skippedMissingIds = 0;
  let skippedBadTime = 0;
  const grouped = new Map();

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
      isNew: a.minEpisode !== null && a.minEpisode <= 2,
      options: Array.from(a.options.values()),
    }))
    .filter((a) => a.options.length > 0)
    .sort((a, b) => a.title.localeCompare(b.title, "ja"));

  return { items, skippedMissingIds, skippedBadTime };
}

// キャッシュ込みで最終的なpayload({updatedAt, items})を返す。
// api/programs.js と api/notify-check.js の両方がこれを直接呼び出す(HTTP経由ではない)。
export async function getProgramPayload({ fresh } = {}) {
  if (!fresh && cache.data && Date.now() - cache.ts < CACHE_MS) {
    return cache.data;
  }
  const { programs } = await fetchRawPrograms();
  const { items } = buildItems(programs);
  const payload = { updatedAt: new Date().toISOString(), items };
  cache = { data: payload, ts: Date.now() };
  return payload;
}
