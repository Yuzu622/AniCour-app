// Vercel Serverless Function: /api/programs
// 実際のデータ取得・整形処理は api/_lib/getPrograms.js に共通化してあり、
// ここではHTTPリクエスト/レスポンスの窓口(と、調査用のdebugモード)だけを担当する。

import { fetchRawPrograms, buildItems, getProgramPayload } from "./_lib/getPrograms.js";

export default async function handler(req, res) {
  try {
    const debug = req.query && (req.query.debug === "1" || req.query.debug === "true");
    const fresh = req.query && (req.query.fresh === "1" || req.query.fresh === "true");

    if (debug) {
      const { raw, programs, url } = await fetchRawPrograms();
      const { items, skippedMissingIds, skippedBadTime } = buildItems(programs);

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
      const allTimes = programs
        .map((p) => Number(p.StTime))
        .filter((n) => n && !isNaN(n))
        .map((n) => n * 1000);
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

    const payload = await getProgramPayload({ fresh });
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({
      error: "取得中にエラーが発生しました: " + (e && e.message ? e.message : String(e)),
      bodyPreview: e && e.bodyPreview,
    });
  }
}
