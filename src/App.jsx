import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Bell, BellOff, Check, Search, Tv } from "lucide-react";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap');`;

const STORAGE_KEY = "anime-tracker-state";

const INK = "#20291F";
const PAPER = "#EEF0E9";
const PAPER_RAISED = "#F7F8F3";
const LINE = "#CFD2C4";
const ACCENT = "#22406E";
const ACCENT_SOFT = "#DCE3ED";
const WARM = "#D8562C";

const PLATFORMS = {
  chijou: { label: "地上波", short: "地", color: "#3F7D5C", soft: "#E1EDE4" },
  bs: { label: "BS", short: "BS", color: "#B98423", soft: "#F1E7D2" },
  netflix: { label: "配信A", short: "N", color: "#B23A48", soft: "#F3DCDF" },
  danime: { label: "配信B", short: "d", color: "#6B4FA0", soft: "#E5DFF0" },
  prime: { label: "配信C", short: "P", color: "#2F7FB0", soft: "#DBEAF3" },
};

const WEEKDAYS_JA = ["月", "火", "水", "木", "金", "土", "日"];

const SEASON_ANIME = [
  { id: "a1", title: "回る回る、木曜日", platform: "chijou", day: 3, time: "24:30", ep: "全12話" },
  { id: "a2", title: "海月と最終列車", platform: "netflix", day: 4, time: "26:00", ep: "全13話" },
  { id: "a3", title: "ぱんぷきん・ラビリンス", platform: "danime", day: 2, time: "23:00", ep: "全12話" },
  { id: "a4", title: "灯台守のうた", platform: "bs", day: 6, time: "24:00", ep: "全24話" },
  { id: "a5", title: "鉄塔クロニクル", platform: "chijou", day: 1, time: "25:30", ep: "全12話" },
  { id: "a6", title: "ハローグッバイ、また明日", platform: "prime", day: 3, time: "27:00", ep: "全12話" },
  { id: "a7", title: "都市伝説カフェ", platform: "chijou", day: 5, time: "25:00", ep: "全12話" },
  { id: "a8", title: "羊たちの夏休み", platform: "danime", day: 0, time: "23:30", ep: "全13話" },
  { id: "a9", title: "電波少女のB面", platform: "netflix", day: 0, time: "24:00", ep: "全12話" },
  { id: "a10", title: "夜行バスと恒星団", platform: "bs", day: 1, time: "23:00", ep: "全12話" },
  { id: "a11", title: "コインランドリーの神様", platform: "prime", day: 2, time: "24:30", ep: "全12話" },
  { id: "a12", title: "百年後のきみへ", platform: "chijou", day: 6, time: "23:30", ep: "全24話" },
];

const COUR_NAME = (month) => {
  if ([1, 2, 3].includes(month)) return "冬クール";
  if ([4, 5, 6].includes(month)) return "春クール";
  if ([7, 8, 9].includes(month)) return "夏クール";
  return "秋クール";
};

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const firstDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    cells.push({ year: y, month: m, date: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ year, month, date: d, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const idx = cells.length - (firstDow + daysInMonth);
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    cells.push({ year: y, month: m, date: idx, inMonth: false });
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export default function App() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState([]);
  const [notify, setNotify] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [dayFilter, setDayFilter] = useState(null);
  const [query, setQuery] = useState("");
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSelected(parsed.selected || []);
        setNotify(parsed.notify || {});
      }
    } catch (e) {
      // 初回はキーが存在しないため何もしない
    }
  }, []);

  const persist = useCallback((nextSelected, nextNotify) => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ selected: nextSelected, notify: nextNotify })
      );
      setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }, []);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const nextNotify = { ...notify };
      if (!prev.includes(id)) nextNotify[id] = true;
      setNotify(nextNotify);
      persist(next, nextNotify);
      return next;
    });
  };

  const toggleNotify = (id) => {
    setNotify((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      persist(selected, next);
      return next;
    });
  };

  const changeMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  const weeks = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const selectedAnimeList = useMemo(
    () => SEASON_ANIME.filter((a) => selected.includes(a.id)),
    [selected]
  );

  const eventsForDow = useMemo(() => {
    const map = {};
    for (const a of selectedAnimeList) {
      if (!map[a.day]) map[a.day] = [];
      map[a.day].push(a);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((x, y) => timeToMinutes(x.time) - timeToMinutes(y.time));
    }
    return map;
  }, [selectedAnimeList]);

  const filteredList = useMemo(() => {
    return SEASON_ANIME.filter((a) => {
      const dayOk = dayFilter === null || a.day === dayFilter;
      const qOk = query.trim() === "" || a.title.includes(query.trim());
      return dayOk && qOk;
    });
  }, [dayFilter, query]);

  const isToday = (cell) =>
    cell.inMonth &&
    cell.year === today.getFullYear() &&
    cell.month === today.getMonth() &&
    cell.date === today.getDate();

  return (
    <div
      style={{
        fontFamily: "'Noto Sans JP', sans-serif",
        color: INK,
        background: PAPER,
        minHeight: "100vh",
        padding: "24px",
      }}
    >
      <style>{FONT_IMPORT}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            borderBottom: `3px solid ${INK}`,
            paddingBottom: 14,
            marginBottom: 4,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span
              style={{
                fontFamily: "'Shippori Mincho B1', serif",
                fontWeight: 700,
                fontSize: 34,
                letterSpacing: "0.02em",
              }}
            >
              {viewYear}年 {COUR_NAME(viewMonth + 1)}
            </span>
            <span style={{ fontSize: 13, color: "#5B6156" }}>視聴クール表</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={goToday} style={ghostBtn}>
              今日
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button onClick={() => changeMonth(-1)} style={iconBtn} aria-label="前の月">
                <ChevronLeft size={18} />
              </button>
              <span style={{ fontSize: 15, fontWeight: 500, minWidth: 66, textAlign: "center" }}>
                {viewMonth + 1}月
              </span>
              <button onClick={() => changeMonth(1)} style={iconBtn} aria-label="次の月">
                <ChevronRight size={18} />
              </button>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              style={{
                ...ghostBtn,
                background: ACCENT,
                color: "#fff",
                border: `1px solid ${ACCENT}`,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Plus size={16} />
              作品を追加
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: "#7A8072", margin: "10px 0 18px" }}>
          モックデータで動作しています。実運用版では放送・配信スケジュールAPIと連携し、通知はService Worker経由のプッシュ通知になります。
          {saveError && <span style={{ color: WARM, marginLeft: 8 }}>選択状態の保存に失敗しました。</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: `1px solid ${LINE}` }}>
          {WEEKDAYS_JA.map((w, i) => (
            <div
              key={w}
              style={{
                textAlign: "center",
                padding: "8px 0",
                fontSize: 13,
                fontWeight: 500,
                background: PAPER_RAISED,
                borderBottom: `1px solid ${LINE}`,
                borderLeft: i === 0 ? "none" : `1px solid ${LINE}`,
                color: i === 5 ? "#2F7FB0" : i === 6 ? "#B23A48" : INK,
              }}
            >
              {w}
            </div>
          ))}

          {weeks.map((week, wi) =>
            week.map((cell, ci) => {
              const evts = cell.inMonth ? eventsForDow[ci] || [] : [];
              return (
                <div
                  key={`${wi}-${ci}`}
                  style={{
                    minHeight: 108,
                    padding: "6px 6px 8px",
                    borderLeft: ci === 0 ? "none" : `1px solid ${LINE}`,
                    borderTop: `1px solid ${LINE}`,
                    background: cell.inMonth ? PAPER_RAISED : PAPER,
                    opacity: cell.inMonth ? 1 : 0.45,
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      fontSize: 12,
                      fontWeight: 500,
                      background: isToday(cell) ? INK : "transparent",
                      color: isToday(cell) ? "#fff" : ci === 5 ? "#2F7FB0" : ci === 6 ? "#B23A48" : INK,
                    }}
                  >
                    {cell.date}
                  </div>
                  <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                    {evts.map((e) => {
                      const p = PLATFORMS[e.platform];
                      return (
                        <div
                          key={e.id}
                          title={`${e.title} / ${p.label} ${e.time}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 11,
                            lineHeight: 1.3,
                            borderLeft: `3px solid ${p.color}`,
                            background: p.soft,
                            padding: "2px 4px",
                            borderRadius: 2,
                            overflow: "hidden",
                          }}
                        >
                          <span
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              color: p.color,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {e.time}
                          </span>
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {e.title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 14 }}>
          {Object.entries(PLATFORMS).map(([key, p]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5B6156" }}>
              <span style={{ width: 10, height: 10, background: p.color, display: "inline-block", borderRadius: 2 }} />
              {p.label}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#5B6156" }}>
          視聴中の作品：{selectedAnimeList.length > 0 ? selectedAnimeList.map((a) => a.title).join("、") : "まだ選択されていません"}
        </div>
      </div>

      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(32,41,31,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 20,
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: PAPER_RAISED,
              width: "100%",
              maxWidth: 560,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              border: `1px solid ${LINE}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 18px",
                borderBottom: `1px solid ${LINE}`,
              }}
            >
              <div>
                <div style={{ fontFamily: "'Shippori Mincho B1', serif", fontWeight: 700, fontSize: 19 }}>
                  {viewYear}年 {COUR_NAME(viewMonth + 1)} ラインナップ
                </div>
                <div style={{ fontSize: 12, color: "#7A8072", marginTop: 2 }}>
                  見ている作品にチェック、通知はベルをタップ
                </div>
              </div>
              <button onClick={() => setModalOpen(false)} style={iconBtn} aria-label="閉じる">
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${LINE}` }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: PAPER,
                  border: `1px solid ${LINE}`,
                  padding: "6px 10px",
                  marginBottom: 10,
                }}
              >
                <Search size={14} color="#7A8072" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="作品名で検索"
                  style={{
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: 13,
                    width: "100%",
                    fontFamily: "inherit",
                    color: INK,
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => setDayFilter(null)} style={dayFilter === null ? dayChipActive : dayChip}>
                  全曜日
                </button>
                {WEEKDAYS_JA.map((w, i) => (
                  <button key={w} onClick={() => setDayFilter(i)} style={dayFilter === i ? dayChipActive : dayChip}>
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowY: "auto", padding: "6px 0" }}>
              {filteredList.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#7A8072" }}>
                  該当する作品がありません
                </div>
              )}
              {filteredList.map((a) => {
                const p = PLATFORMS[a.platform];
                const isSel = selected.includes(a.id);
                return (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 18px",
                      borderBottom: `1px solid ${LINE}`,
                      background: isSel ? ACCENT_SOFT : "transparent",
                    }}
                  >
                    <button
                      onClick={() => toggleSelect(a.id)}
                      aria-label={isSel ? "選択解除" : "選択"}
                      style={{
                        width: 20,
                        height: 20,
                        flexShrink: 0,
                        border: `1.5px solid ${isSel ? ACCENT : "#A9AE9E"}`,
                        background: isSel ? ACCENT : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 3,
                        cursor: "pointer",
                      }}
                    >
                      {isSel && <Check size={13} color="#fff" strokeWidth={3} />}
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {a.title}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: p.color,
                            background: p.soft,
                            padding: "1px 6px",
                            borderRadius: 2,
                          }}
                        >
                          {p.label}
                        </span>
                        <span style={{ fontSize: 11.5, color: "#7A8072" }}>
                          {WEEKDAYS_JA[a.day]}曜 {a.time} ・ {a.ep}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => isSel && toggleNotify(a.id)}
                      disabled={!isSel}
                      aria-label="通知設定"
                      style={{
                        width: 30,
                        height: 30,
                        flexShrink: 0,
                        border: "none",
                        background: "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: isSel ? "pointer" : "default",
                        color: isSel ? (notify[a.id] ? WARM : "#A9AE9E") : "#D3D5C9",
                      }}
                    >
                      {isSel && notify[a.id] ? <Bell size={17} /> : <BellOff size={17} />}
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: "10px 18px", borderTop: `1px solid ${LINE}`, fontSize: 11, color: "#7A8072" }}>
              <Tv size={12} style={{ verticalAlign: "-1px", marginRight: 4 }} />
              通知トグルは表示のみのデモです。実運用ではブラウザのプッシュ通知権限が別途必要です。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ghostBtn = {
  border: `1px solid ${LINE}`,
  background: "transparent",
  padding: "7px 12px",
  fontSize: 13,
  cursor: "pointer",
  color: INK,
  fontFamily: "inherit",
};

const iconBtn = {
  border: `1px solid ${LINE}`,
  background: "transparent",
  width: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: INK,
};

const dayChip = {
  border: `1px solid ${LINE}`,
  background: "transparent",
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
  color: "#5B6156",
  fontFamily: "inherit",
};

const dayChipActive = {
  ...dayChip,
  background: ACCENT,
  color: "#fff",
  border: `1px solid ${ACCENT}`,
};
