import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Bell, BellOff, Check, Search, Sparkles, ChevronDown } from "lucide-react";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@700;800&family=Noto+Sans+JP:wght@400;500;700&display=swap');`;

const STORAGE_KEY = "anime-tracker-state";

const BG = "#FFF6FA";
const SURFACE = "#FFFFFF";
const INK = "#2B2140";
const INK_SOFT = "#8577A3";
const LINE = "#F1DCE9";
const PINK = "#FF3D7F";
const PINK_SOFT = "#FFE3EE";
const BLUE = "#3DA9FF";

const WEEKDAYS_JA = ["月", "火", "水", "木", "金", "土", "日"];
const WEEKDAY_COLORS = ["#FF3D7F", "#FF9F1C", "#E8B800", "#17B978", "#22C3C3", "#3DA9FF", "#FF5A5F"];
const WEEKDAY_SOFT = ["#FFE3EE", "#FFEBD6", "#FFF6D1", "#DFF7EC", "#DBF6F6", "#E1F1FF", "#FFE1E2"];

const PLATFORMS = {
  chijou: { label: "地上波", color: "#17B978", soft: "#DFF7EC" },
  bs: { label: "BS", color: "#FF9F1C", soft: "#FFEFD6" },
  netflix: { label: "配信A", color: "#FF5A5F", soft: "#FFE1E2" },
  danime: { label: "配信B", color: "#8B5CF6", soft: "#EEE7FE" },
  prime: { label: "配信C", color: "#3DA9FF", soft: "#E1F1FF" },
};

// 1タイトルにつき複数の視聴方法(放送局/配信サービスごとに曜日・時間が異なる)を持たせる
const SEASON_ANIME = [
  {
    id: "t1",
    title: "回る回る、木曜日",
    ep: "全12話",
    options: [
      { id: "t1-chijou", platform: "chijou", day: 3, time: "24:30" },
      { id: "t1-netflix", platform: "netflix", day: 3, time: "25:00" },
    ],
  },
  {
    id: "t2",
    title: "海月と最終列車",
    ep: "全13話",
    options: [{ id: "t2-netflix", platform: "netflix", day: 4, time: "26:00" }],
  },
  {
    id: "t3",
    title: "ぱんぷきん・ラビリンス",
    ep: "全12話",
    options: [
      { id: "t3-danime", platform: "danime", day: 2, time: "23:00" },
      { id: "t3-chijou", platform: "chijou", day: 2, time: "25:00" },
    ],
  },
  {
    id: "t4",
    title: "灯台守のうた",
    ep: "全24話",
    options: [
      { id: "t4-bs", platform: "bs", day: 6, time: "24:00" },
      { id: "t4-prime", platform: "prime", day: 0, time: "12:00" },
    ],
  },
  {
    id: "t5",
    title: "鉄塔クロニクル",
    ep: "全12話",
    options: [{ id: "t5-chijou", platform: "chijou", day: 1, time: "25:30" }],
  },
  {
    id: "t6",
    title: "ハローグッバイ、また明日",
    ep: "全12話",
    options: [{ id: "t6-prime", platform: "prime", day: 3, time: "27:00" }],
  },
  {
    id: "t7",
    title: "都市伝説カフェ",
    ep: "全12話",
    options: [
      { id: "t7-chijou", platform: "chijou", day: 5, time: "25:00" },
      { id: "t7-netflix", platform: "netflix", day: 5, time: "26:00" },
      { id: "t7-danime", platform: "danime", day: 6, time: "24:00" },
    ],
  },
  {
    id: "t8",
    title: "羊たちの夏休み",
    ep: "全13話",
    options: [{ id: "t8-danime", platform: "danime", day: 0, time: "23:30" }],
  },
  {
    id: "t9",
    title: "電波少女のB面",
    ep: "全12話",
    options: [
      { id: "t9-netflix", platform: "netflix", day: 0, time: "24:00" },
      { id: "t9-chijou", platform: "chijou", day: 1, time: "25:00" },
    ],
  },
  {
    id: "t10",
    title: "夜行バスと恒星団",
    ep: "全12話",
    options: [{ id: "t10-bs", platform: "bs", day: 1, time: "23:00" }],
  },
  {
    id: "t11",
    title: "コインランドリーの神様",
    ep: "全12話",
    options: [{ id: "t11-prime", platform: "prime", day: 2, time: "24:30" }],
  },
  {
    id: "t12",
    title: "百年後のきみへ",
    ep: "全24話",
    options: [
      { id: "t12-chijou", platform: "chijou", day: 5, time: "23:30" },
      { id: "t12-bs", platform: "bs", day: 6, time: "24:00" },
    ],
  },
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

function findSelectedOption(anime, selected) {
  return anime.options.find((o) => selected.includes(o.id));
}

function AnimeRow({ anime, selected, notify, isExpanded, onToggleExpand, onSelectOption, onToggleNotify }) {
  const chosen = findSelectedOption(anime, selected);

  return (
    <div style={{ borderBottom: `1px solid ${LINE}` }}>
      <div
        onClick={onToggleExpand}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 18px",
          cursor: "pointer",
          background: chosen ? PINK_SOFT : "transparent",
        }}
      >
        <div
          style={{
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            color: INK_SOFT,
            flexShrink: 0,
          }}
        >
          <ChevronDown size={16} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {anime.title}
          </div>
          {chosen ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: PLATFORMS[chosen.platform].color,
                  background: PLATFORMS[chosen.platform].soft,
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {PLATFORMS[chosen.platform].label}
              </span>
              <span style={{ fontSize: 11.5, color: INK_SOFT }}>
                {WEEKDAYS_JA[chosen.day]}曜 {chosen.time} ・ {anime.ep}
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
              {anime.options.map((o) => (
                <span
                  key={o.id}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: PLATFORMS[o.platform].color,
                    border: `1px solid ${PLATFORMS[o.platform].color}55`,
                    padding: "1px 7px",
                    borderRadius: 999,
                  }}
                >
                  {PLATFORMS[o.platform].label}
                </span>
              ))}
              <span style={{ fontSize: 11, color: INK_SOFT }}>・{anime.ep}</span>
            </div>
          )}
        </div>

        {chosen && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleNotify(chosen.id);
            }}
            aria-label="通知設定"
            style={{
              width: 32,
              height: 32,
              flexShrink: 0,
              border: "none",
              borderRadius: "50%",
              background: notify[chosen.id] ? "#FFF1D6" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: notify[chosen.id] ? "#E8B800" : "#C9BEDC",
            }}
          >
            {notify[chosen.id] ? <Bell size={17} /> : <BellOff size={17} />}
          </button>
        )}
      </div>

      {isExpanded && (
        <div style={{ padding: "0 18px 14px 44px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, color: INK_SOFT, marginBottom: 2 }}>視聴方法を選んでください</div>
          {anime.options.map((o) => {
            const p = PLATFORMS[o.platform];
            const isChosen = chosen && chosen.id === o.id;
            return (
              <button
                key={o.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectOption(anime, o.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  border: `2px solid ${isChosen ? p.color : LINE}`,
                  background: isChosen ? p.soft : SURFACE,
                  borderRadius: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `2px solid ${isChosen ? p.color : "#D9CFE0"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {isChosen && <div style={{ width: 9, height: 9, borderRadius: "50%", background: p.color }} />}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: p.color, background: p.soft, padding: "2px 8px", borderRadius: 999 }}>
                  {p.label}
                </span>
                <span style={{ fontSize: 12.5, color: INK, fontWeight: 500 }}>
                  {WEEKDAYS_JA[o.day]}曜 {o.time}〜
                </span>
              </button>
            );
          })}
          {chosen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectOption(anime, chosen.id);
              }}
              style={{
                alignSelf: "flex-start",
                marginTop: 2,
                border: "none",
                background: "transparent",
                color: INK_SOFT,
                fontSize: 11.5,
                textDecoration: "underline",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              選択を解除する
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState([]);
  const [notify, setNotify] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [platformFilter, setPlatformFilter] = useState(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
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

  // ある作品について、選んだ視聴方法(optionId)をセットする。同じものをもう一度押すと解除。
  const selectOption = (anime, optionId) => {
    setSelected((prev) => {
      const otherIds = anime.options.map((o) => o.id);
      const withoutThisAnime = prev.filter((id) => !otherIds.includes(id));
      const alreadyChosen = prev.includes(optionId);
      const next = alreadyChosen ? withoutThisAnime : [...withoutThisAnime, optionId];

      const nextNotify = { ...notify };
      if (!alreadyChosen) nextNotify[optionId] = true;
      setNotify(nextNotify);
      persist(next, nextNotify);
      return next;
    });
  };

  const toggleNotify = (optionId) => {
    setNotify((prev) => {
      const next = { ...prev, [optionId]: !prev[optionId] };
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

  // 選択済みの視聴方法をフラット化(タイトル情報を付けてカレンダー描画に使う)
  const selectedEvents = useMemo(() => {
    const list = [];
    for (const anime of SEASON_ANIME) {
      const chosen = findSelectedOption(anime, selected);
      if (chosen) list.push({ ...chosen, title: anime.title, ep: anime.ep, animeId: anime.id });
    }
    return list;
  }, [selected]);

  const eventsForDow = useMemo(() => {
    const map = {};
    for (const e of selectedEvents) {
      if (!map[e.day]) map[e.day] = [];
      map[e.day].push(e);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((x, y) => timeToMinutes(x.time) - timeToMinutes(y.time));
    }
    return map;
  }, [selectedEvents]);

  const filteredList = useMemo(() => {
    return SEASON_ANIME.filter((a) => {
      const platformOk = platformFilter === null || a.options.some((o) => o.platform === platformFilter);
      const qOk = query.trim() === "" || a.title.includes(query.trim());
      return platformOk && qOk;
    });
  }, [platformFilter, query]);

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
        background: BG,
        minHeight: "100vh",
        padding: "24px",
      }}
    >
      <style>{FONT_IMPORT}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontFamily: "'M PLUS Rounded 1c', sans-serif",
                fontWeight: 800,
                fontSize: 22,
                letterSpacing: "0.02em",
                color: "#fff",
                background: PINK,
                padding: "8px 18px",
                borderRadius: 999,
                boxShadow: "0 4px 0 #D62A63",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Sparkles size={17} />
              {viewYear}年 {COUR_NAME(viewMonth + 1)}
            </span>
            <span style={{ fontSize: 13, color: INK_SOFT, fontWeight: 500 }}>視聴クール表</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={goToday} style={ghostBtn}>
              今日
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button onClick={() => changeMonth(-1)} style={iconBtn} aria-label="前の月">
                <ChevronLeft size={18} />
              </button>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  minWidth: 66,
                  textAlign: "center",
                  fontFamily: "'M PLUS Rounded 1c', sans-serif",
                }}
              >
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
                background: BLUE,
                color: "#fff",
                border: "none",
                boxShadow: "0 4px 0 #1E7FCC",
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

        <div
          style={{
            fontSize: 12,
            color: INK_SOFT,
            margin: "0 0 16px",
            background: SURFACE,
            border: `1px solid ${LINE}`,
            borderRadius: 12,
            padding: "8px 14px",
          }}
        >
          モックデータで動作しています。実運用版では放送・配信スケジュールAPIと連携し、通知はService Worker経由のプッシュ通知になります。
          {saveError && <span style={{ color: PINK, marginLeft: 8, fontWeight: 700 }}>選択状態の保存に失敗しました。</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {WEEKDAYS_JA.map((w, i) => (
            <div
              key={w}
              style={{
                textAlign: "center",
                padding: "7px 0",
                fontSize: 13,
                fontWeight: 800,
                fontFamily: "'M PLUS Rounded 1c', sans-serif",
                background: WEEKDAY_SOFT[i],
                borderRadius: 10,
                color: WEEKDAY_COLORS[i],
              }}
            >
              {w}
            </div>
          ))}

          {weeks.map((week, wi) =>
            week.map((cell, ci) => {
              const evts = cell.inMonth ? eventsForDow[ci] || [] : [];
              const today_ = isToday(cell);
              return (
                <div
                  key={`${wi}-${ci}`}
                  style={{
                    minHeight: 106,
                    padding: "8px 7px 8px",
                    borderRadius: 12,
                    background: cell.inMonth ? SURFACE : "transparent",
                    border: cell.inMonth ? `1px solid ${LINE}` : "1px dashed transparent",
                    boxShadow: cell.inMonth ? "0 2px 0 rgba(43,33,64,0.05)" : "none",
                    opacity: cell.inMonth ? 1 : 0.35,
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      fontSize: 12,
                      fontWeight: today_ ? 800 : 500,
                      background: today_ ? PINK : "transparent",
                      color: today_ ? "#fff" : WEEKDAY_COLORS[ci],
                      boxShadow: today_ ? "0 2px 0 #D62A63" : "none",
                    }}
                  >
                    {cell.date}
                  </div>
                  <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 4 }}>
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
                            fontSize: 10.5,
                            lineHeight: 1.3,
                            background: p.soft,
                            padding: "3px 7px",
                            borderRadius: 999,
                            overflow: "hidden",
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                          <span style={{ fontVariantNumeric: "tabular-nums", color: p.color, fontWeight: 700, flexShrink: 0 }}>
                            {e.time}
                          </span>
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: INK }}>
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

        <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(PLATFORMS).map(([key, p]) => (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: p.color,
                background: p.soft,
                padding: "4px 12px",
                borderRadius: 999,
              }}
            >
              <span style={{ width: 8, height: 8, background: p.color, display: "inline-block", borderRadius: "50%" }} />
              {p.label}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: INK_SOFT }}>
          視聴中の作品：{selectedEvents.length > 0 ? selectedEvents.map((e) => e.title).join("、") : "まだ選択されていません"}
        </div>
      </div>

      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(43,33,64,0.45)",
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
              background: SURFACE,
              width: "100%",
              maxWidth: 560,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              borderRadius: 20,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 18px",
                background: PINK,
              }}
            >
              <div>
                <div style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif", fontWeight: 800, fontSize: 18, color: "#fff" }}>
                  {viewYear}年 {COUR_NAME(viewMonth + 1)} ラインナップ
                </div>
                <div style={{ fontSize: 12, color: "#FFE3EE", marginTop: 2 }}>
                  作品をタップして視聴方法を選んでください
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                style={{ ...iconBtn, border: "none", background: "rgba(255,255,255,0.25)", color: "#fff" }}
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${LINE}` }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: BG,
                  border: `1px solid ${LINE}`,
                  padding: "7px 12px",
                  borderRadius: 999,
                  marginBottom: 10,
                }}
              >
                <Search size={14} color={INK_SOFT} />
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
                <button onClick={() => setPlatformFilter(null)} style={platformFilter === null ? dayChipActive : dayChip}>
                  すべて
                </button>
                {Object.entries(PLATFORMS).map(([key, p]) => (
                  <button
                    key={key}
                    onClick={() => setPlatformFilter(key)}
                    style={
                      platformFilter === key
                        ? { ...dayChipActive, background: p.color }
                        : { ...dayChip, color: p.color, background: p.soft }
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowY: "auto" }}>
              {filteredList.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>
                  該当する作品がありません
                </div>
              )}
              {filteredList.map((anime) => (
                <AnimeRow
                  key={anime.id}
                  anime={anime}
                  selected={selected}
                  notify={notify}
                  isExpanded={expandedId === anime.id}
                  onToggleExpand={() => setExpandedId((prev) => (prev === anime.id ? null : anime.id))}
                  onSelectOption={selectOption}
                  onToggleNotify={toggleNotify}
                />
              ))}
            </div>

            <div style={{ padding: "10px 18px", borderTop: `1px solid ${LINE}`, fontSize: 11, color: INK_SOFT }}>
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
  background: SURFACE,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  color: INK,
  fontFamily: "inherit",
  borderRadius: 999,
};

const iconBtn = {
  border: `1px solid ${LINE}`,
  background: SURFACE,
  width: 32,
  height: 32,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: INK,
};

const dayChip = {
  border: "none",
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  borderRadius: 999,
};

const dayChipActive = {
  ...dayChip,
  color: "#fff",
};
