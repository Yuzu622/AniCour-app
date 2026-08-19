import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Bell,
  BellOff,
  Check,
  Search,
  Sparkles,
  ChevronDown,
  RefreshCw,
  AlertTriangle,
  Palette,
  RotateCcw,
  Smartphone,
} from "lucide-react";

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

// しょぼいカレンダーのチャンネル名から推測したカテゴリごとの見た目
const CATEGORY_STYLE = {
  chijou: { label: "地上波", color: "#17A673", soft: "#DFF7EC" },
  bs: { label: "BS", color: "#F2994A", soft: "#FFEFD6" },
  cs: { label: "CS", color: "#2FB8C6", soft: "#DBF6F6" },
};

// 配信サービスごとの色(サーバー側classify()のprovider名と対応)
// 地上波の緑と被らないよう、暖色〜寒色をなるべく散らして割り当てている
const PROVIDER_STYLE = {
  Netflix: { color: "#E5344A", soft: "#FCE0E4" },
  dアニメストア: { color: "#9B59D0", soft: "#EEE7FE" },
  "Prime Video": { color: "#2D7DD2", soft: "#DFF3FC" },
  ABEMA: { color: "#E0479E", soft: "#FCE3F1" },
  "DMM TV": { color: "#C77D1E", soft: "#F5E7D2" },
  Hulu: { color: "#5C7A99", soft: "#E4EBF0" },
  "U-NEXT": { color: "#33383D", soft: "#E7E7E9" },
  "Disney+": { color: "#1450A3", soft: "#DDE9F8" },
  ニコニコ: { color: "#E67E22", soft: "#FBE8D6" },
  FOD: { color: "#D6336C", soft: "#FBE0EA" },
  Lemino: { color: "#6C5CE7", soft: "#E7E4FC" },
  アニメLIVE: { color: "#16A085", soft: "#DBF3EE" },
  YouTube: { color: "#CC3B22", soft: "#FBE1DA" },
  TVer: { color: "#B8860B", soft: "#FCF3D6" },
};
const FALLBACK_STYLE = { color: "#8577A3", soft: "#EFEBF5" };
const COLOR_OVERRIDES_KEY = "anime-tracker-colors";
// プッシュ通知用のVAPID公開鍵(秘密鍵はサーバー側だけに置く。これは公開して問題ない値)
const VAPID_PUBLIC_KEY = "BD5uwcq4jihRRuWhXVoBOZRX4Bc-G57sFAHXcJPlHiEXzPe6AJDXcU-ZA-uc04CT_3tnwd3cpSiuevYKqg1isnY";

// 視聴オプション1件ぶんの色・ラベル・絞り込み用キーをまとめて解決する
function styleFor(o) {
  if (o.category === "streaming") return PROVIDER_STYLE[o.provider] || FALLBACK_STYLE;
  return CATEGORY_STYLE[o.category] || FALLBACK_STYLE;
}
function labelFor(o) {
  if (o.category === "streaming") return o.provider || "配信(その他)";
  return (CATEGORY_STYLE[o.category] || {}).label || o.category;
}
function groupKeyFor(o) {
  return o.category === "streaming" ? o.provider || "streaming_other" : o.category;
}
// 6桁hexカラーの末尾に透過度を足して、淡い背景色を機械的に作る
function withAlpha(hex, alphaHex) {
  if (!hex || hex[0] !== "#" || hex.length !== 7) return hex;
  return hex + alphaHex;
}
// カスタムカラー(overrides)があればそちらを優先して色を解決する
function resolveStyle(o, overrides) {
  const key = groupKeyFor(o);
  const custom = overrides && overrides[key];
  if (custom) return { color: custom, soft: withAlpha(custom, "26") };
  return styleFor(o);
}

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

// 週表示ヘッダー用に "8/11-8/17" のような範囲文字列を作る
function formatWeekRange(weekDays) {
  if (!weekDays || weekDays.length === 0) return "";
  const first = weekDays[0];
  const last = weekDays[weekDays.length - 1];
  return `${first.month + 1}/${first.date}-${last.month + 1}/${last.date}`;
}

function findSelectedOption(anime, selected) {
  return anime.options.find((o) => selected.includes(o.id));
}

// 幅任せのCSS省略だと極端に短くなることがあるため、文字数で確実に切り詰める
function truncateTitle(title, n) {
  if (!title) return "";
  return title.length > n ? title.slice(0, n) + "…" : title;
}

// そのオプションで一番近い(=実データで確認できている最初の)放送日を "8/6" のように整形する
function formatNextAiring(o) {
  if (!o.airings || o.airings.length === 0) return null;
  const datePart = o.airings[0].key.split("T")[0];
  const [, m, d] = datePart.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// 直近でわかっている話数("第12話"のように整形、不明ならnull)
function nextEpisodeLabel(o) {
  if (!o.airings || o.airings.length === 0) return null;
  const ep = o.airings[0].episode;
  return ep ? `第${ep}話` : null;
}

function AnimeRow({ anime, selected, notify, isExpanded, onToggleExpand, onSelectOption, onToggleNotify, colorOverrides }) {
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
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: resolveStyle(chosen, colorOverrides).color,
                  background: resolveStyle(chosen, colorOverrides).soft,
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {chosen.chName}
              </span>
              <span style={{ fontSize: 11.5, color: INK_SOFT }}>
                {WEEKDAYS_JA[chosen.day]}曜 {chosen.time}〜
                {formatNextAiring(chosen) && ` ・次回 ${formatNextAiring(chosen)}`}
                {nextEpisodeLabel(chosen) && ` (${nextEpisodeLabel(chosen)})`}
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
                    color: resolveStyle(o, colorOverrides).color,
                    border: `1px solid ${resolveStyle(o, colorOverrides).color}55`,
                    padding: "1px 7px",
                    borderRadius: 999,
                  }}
                >
                  {o.chName}
                </span>
              ))}
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
            const cat = resolveStyle(o, colorOverrides);
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
                  border: `2px solid ${isChosen ? cat.color : LINE}`,
                  background: isChosen ? cat.soft : SURFACE,
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
                    border: `2px solid ${isChosen ? cat.color : "#D9CFE0"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {isChosen && <div style={{ width: 9, height: 9, borderRadius: "50%", background: cat.color }} />}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: cat.color, background: cat.soft, padding: "2px 8px", borderRadius: 999 }}>
                  {o.chName}
                </span>
                <span style={{ fontSize: 12.5, color: INK, fontWeight: 500, flex: 1 }}>
                  {WEEKDAYS_JA[o.day]}曜 {o.time}〜
                </span>
                {formatNextAiring(o) && (
                  <span style={{ fontSize: 11, color: INK_SOFT, flexShrink: 0 }}>
                    次回 {formatNextAiring(o)}
                    {nextEpisodeLabel(o) && ` (${nextEpisodeLabel(o)})`}
                  </span>
                )}
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
  const [detailAnimeId, setDetailAnimeId] = useState(null);
  const [dayDetailKey, setDayDetailKey] = useState(null);
  const [isCompact, setIsCompact] = useState(false);
  const [viewMode, setViewMode] = useState("month");
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 680px)");
    const update = () => setIsCompact(mq.matches);
    update();
    mq.addEventListener ? mq.addEventListener("change", update) : mq.addListener(update);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", update) : mq.removeListener(update);
    };
  }, []);
  const [colorOverrides, setColorOverrides] = useState({});
  const [colorPanelOpen, setColorPanelOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLOR_OVERRIDES_KEY);
      if (raw) setColorOverrides(JSON.parse(raw));
    } catch (e) {
      // 初回はキーが存在しないため何もしない
    }
  }, []);

  const setOneColor = (key, hex) => {
    setColorOverrides((prev) => {
      const next = { ...prev, [key]: hex };
      try {
        window.localStorage.setItem(COLOR_OVERRIDES_KEY, JSON.stringify(next));
      } catch (e) {
        // 保存に失敗しても表示上は反映させる
      }
      return next;
    });
  };

  const resetOneColor = (key) => {
    setColorOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      try {
        window.localStorage.setItem(COLOR_OVERRIDES_KEY, JSON.stringify(next));
      } catch (e) {
        // noop
      }
      return next;
    });
  };

  const [animeList, setAnimeList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/programs");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `サーバーエラー (status ${res.status})`);
      }
      const data = await res.json();
      setAnimeList(data.items || []);
      setUpdatedAt(data.updatedAt || null);
    } catch (e) {
      setFetchError(e.message || "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

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

  // 複数端末同期(合言葉ベース、Upstash Redis経由)
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const [syncCode, setSyncCode] = useState("");
  const [syncCodeInput, setSyncCodeInput] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("anicour-sync-code");
      if (saved) {
        setSyncCode(saved);
        setSyncCodeInput(saved);
      }
    } catch (e) {
      // noop
    }
  }, []);

  const uploadSync = async () => {
    setSyncBusy(true);
    setSyncMsg("");
    try {
      const body = { data: { selected, notify, colorOverrides } };
      if (syncCodeInput.trim()) body.code = syncCodeInput.trim();
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存に失敗しました");
      setSyncCode(json.code);
      setSyncCodeInput(json.code);
      window.localStorage.setItem("anicour-sync-code", json.code);
      setSyncMsg(`この端末の内容を保存しました。合言葉: ${json.code}`);
    } catch (e) {
      setSyncMsg("エラー: " + e.message);
    }
    setSyncBusy(false);
  };

  const downloadSync = async () => {
    const code = syncCodeInput.trim();
    if (!code) {
      setSyncMsg("合言葉を入力してください");
      return;
    }
    setSyncBusy(true);
    setSyncMsg("");
    try {
      const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "読み込みに失敗しました");
      const d = json.data || {};
      const nextSelected = d.selected || [];
      const nextNotify = d.notify || {};
      const nextColors = d.colorOverrides || {};
      setSelected(nextSelected);
      setNotify(nextNotify);
      setColorOverrides(nextColors);
      persist(nextSelected, nextNotify);
      try {
        window.localStorage.setItem(COLOR_OVERRIDES_KEY, JSON.stringify(nextColors));
      } catch (e) {
        // noop
      }
      const upperCode = code.toUpperCase();
      setSyncCode(upperCode);
      setSyncCodeInput(upperCode);
      window.localStorage.setItem("anicour-sync-code", upperCode);
      setSyncMsg("この端末に読み込みました");
    } catch (e) {
      setSyncMsg("エラー: " + e.message);
    }
    setSyncBusy(false);
  };

  // プッシュ通知(配信直前のお知らせ)
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushEnabled(!!sub))
      .catch(() => {});
  }, []);

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  const enablePush = async () => {
    setPushBusy(true);
    setPushMsg("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("この端末/ブラウザはプッシュ通知に対応していません");
      }
      if (!VAPID_PUBLIC_KEY) {
        throw new Error("通知機能の設定(VAPID鍵)が未完了です");
      }
      // 通知を紐づけるための合言葉が無ければ、先に自動発行して端末の内容を保存する
      let code = syncCodeInput.trim();
      if (!code) {
        const body = { data: { selected, notify, colorOverrides } };
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "合言葉の発行に失敗しました");
        code = json.code;
        setSyncCode(code);
        setSyncCodeInput(code);
        window.localStorage.setItem("anicour-sync-code", code);
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("通知が許可されませんでした");

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const res2 = await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subscription: sub }),
      });
      const json2 = await res2.json();
      if (!res2.ok) throw new Error(json2.error || "登録に失敗しました");

      setPushEnabled(true);
      setPushMsg("通知をONにしました。忘れずに「この端末の内容を保存」もしておくと、選び直すたびに反映されます。");
    } catch (e) {
      setPushMsg("エラー: " + e.message);
    }
    setPushBusy(false);
  };

  const disablePush = async () => {
    setPushBusy(true);
    setPushMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      if (syncCode) {
        await fetch(`/api/push-subscribe?code=${encodeURIComponent(syncCode)}`, { method: "DELETE" });
      }
      setPushEnabled(false);
      setPushMsg("通知をOFFにしました");
    } catch (e) {
      setPushMsg("エラー: " + e.message);
    }
    setPushBusy(false);
  };

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

  const changeWeek = (delta) => {
    setWeekAnchor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta * 7);
      return d;
    });
  };

  const goToday = () => {
    if (viewMode === "week") {
      setWeekAnchor(new Date());
    } else {
      setViewYear(today.getFullYear());
      setViewMonth(today.getMonth());
    }
  };

  const weeks = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // 週表示: weekAnchorを含む月曜始まりの7日間
  const weekDays = useMemo(() => {
    const d = new Date(weekAnchor);
    const dow = (d.getDay() + 6) % 7; // 0=月 ... 6=日
    const monday = new Date(d);
    monday.setDate(d.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      return { year: day.getFullYear(), month: day.getMonth(), date: day.getDate(), inMonth: true };
    });
  }, [weekAnchor]);

  // 選択済みの視聴方法をフラット化(タイトル情報を付けてカレンダー描画に使う)
  const selectedEvents = useMemo(() => {
    const list = [];
    for (const anime of animeList) {
      const chosen = findSelectedOption(anime, selected);
      if (chosen) list.push({ ...chosen, title: anime.title, animeId: anime.id });
    }
    return list;
  }, [animeList, selected]);

  // 実際に取得できた放送日(airings)だけを使って、日付ごとのイベント一覧を作る。
  // 「曜日の繰り返し」で無限に表示するのではなく、本物のデータがある日だけ表示する。
  const eventsByDate = useMemo(() => {
    const map = {};
    for (const e of selectedEvents) {
      const airings = e.airings && e.airings.length > 0 ? e.airings : [];
      for (const a of airings) {
        const [datePart, timePart] = a.key.split("T");
        if (!map[datePart]) map[datePart] = [];
        map[datePart].push({ ...e, time: timePart, episode: a.episode });
      }
    }
    for (const key of Object.keys(map)) {
      map[key].sort((x, y) => (x.time > y.time ? 1 : -1));
    }
    return map;
  }, [selectedEvents]);

  const [newOnly, setNewOnly] = useState(false);

  const filteredList = useMemo(() => {
    return animeList.filter((a) => {
      const platformOk = platformFilter === null || a.options.some((o) => groupKeyFor(o) === platformFilter);
      const qOk = query.trim() === "" || a.title.includes(query.trim());
      const newOk = !newOnly || a.isNew;
      return platformOk && qOk && newOk;
    });
  }, [animeList, platformFilter, query, newOnly]);

  // 今期の新番組らしきものが何件あるか(トグルの表示に使う)
  const newCount = useMemo(() => animeList.filter((a) => a.isNew).length, [animeList]);

  // 今読み込めているデータの中に実際に存在するカテゴリ/配信サービスだけを絞り込みチップとして出す
  const availableGroups = useMemo(() => {
    const map = new Map();
    for (const a of animeList) {
      for (const o of a.options) {
        const key = groupKeyFor(o);
        if (!map.has(key)) map.set(key, { key, label: labelFor(o), style: resolveStyle(o, colorOverrides) });
      }
    }
    const priority = ["chijou", "bs", "cs"];
    return Array.from(map.values()).sort((a, b) => {
      const ai = priority.indexOf(a.key);
      const bi = priority.indexOf(b.key);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.label.localeCompare(b.label, "ja");
    });
  }, [animeList, colorOverrides]);

  const detailAnime = useMemo(
    () => animeList.find((a) => a.id === detailAnimeId) || null,
    [animeList, detailAnimeId]
  );

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
        padding: isCompact ? "10px" : "24px",
      }}
    >
      <style>{FONT_IMPORT}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: isCompact ? 8 : 18,
            flexWrap: "wrap",
            gap: isCompact ? 6 : 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: isCompact ? 6 : 12, minWidth: 0 }}>
            <span
              style={{
                fontFamily: "'M PLUS Rounded 1c', sans-serif",
                fontWeight: 800,
                fontSize: isCompact ? 14 : 22,
                letterSpacing: "0.02em",
                color: "#fff",
                background: PINK,
                padding: isCompact ? "5px 10px" : "8px 18px",
                borderRadius: 999,
                boxShadow: isCompact ? "0 2px 0 #D62A63" : "0 4px 0 #D62A63",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
              }}
            >
              <Sparkles size={isCompact ? 13 : 17} />
              {viewYear}年 {COUR_NAME(viewMonth + 1)}
            </span>
            {!isCompact && <span style={{ fontSize: 13, color: INK_SOFT, fontWeight: 500 }}>AniCour ・ 視聴クール表</span>}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: isCompact ? 4 : 8,
              width: isCompact ? "100%" : "auto",
              justifyContent: isCompact ? "space-between" : "flex-start",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: isCompact ? 4 : 8 }}>
              <div style={{ display: "flex", border: `1px solid ${LINE}`, borderRadius: 999, padding: 2, gap: 2 }}>
                <button
                  onClick={() => setViewMode("month")}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: isCompact ? "4px 8px" : "5px 10px",
                    fontSize: isCompact ? 10.5 : 12,
                    fontWeight: 700,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    background: viewMode === "month" ? INK : "transparent",
                    color: viewMode === "month" ? "#fff" : INK_SOFT,
                  }}
                >
                  月
                </button>
                <button
                  onClick={() => setViewMode("week")}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: isCompact ? "4px 8px" : "5px 10px",
                    fontSize: isCompact ? 10.5 : 12,
                    fontWeight: 700,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    background: viewMode === "week" ? INK : "transparent",
                    color: viewMode === "week" ? "#fff" : INK_SOFT,
                  }}
                >
                  週
                </button>
              </div>
              <button
                onClick={goToday}
                style={
                  isCompact
                    ? { ...ghostBtn, padding: "5px 8px", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }
                    : { ...ghostBtn, whiteSpace: "nowrap" }
                }
              >
                今日
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                <button
                  onClick={() => (viewMode === "week" ? changeWeek(-1) : changeMonth(-1))}
                  style={isCompact ? { ...iconBtn, width: 24, height: 24 } : iconBtn}
                  aria-label="前へ"
                >
                  <ChevronLeft size={isCompact ? 14 : 18} />
                </button>
                <span
                  style={{
                    fontSize: isCompact ? 12 : 15,
                    fontWeight: 700,
                    minWidth: isCompact ? 56 : 96,
                    textAlign: "center",
                    fontFamily: "'M PLUS Rounded 1c', sans-serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  {viewMode === "week" ? formatWeekRange(weekDays) : `${viewMonth + 1}月`}
                </span>
                <button
                  onClick={() => (viewMode === "week" ? changeWeek(1) : changeMonth(1))}
                  style={isCompact ? { ...iconBtn, width: 24, height: 24 } : iconBtn}
                  aria-label="次へ"
                >
                  <ChevronRight size={isCompact ? 14 : 18} />
                </button>
              </div>
            </div>

            <button
              onClick={() => setModalOpen(true)}
              style={{
                ...ghostBtn,
                background: BLUE,
                color: "#fff",
                border: "none",
                boxShadow: isCompact ? "0 2px 0 #1E7FCC" : "0 4px 0 #1E7FCC",
                display: "flex",
                alignItems: "center",
                gap: isCompact ? 3 : 6,
                padding: isCompact ? "6px 10px" : "8px 16px",
                fontSize: isCompact ? 12 : 13,
                flexShrink: 0,
                marginLeft: isCompact ? "auto" : 0,
              }}
            >
              <Plus size={isCompact ? 13 : 16} />
              作品を追加
            </button>
          </div>
        </div>

        <div
          style={{
            fontSize: isCompact ? 10.5 : 12,
            color: INK_SOFT,
            margin: isCompact ? "0 0 8px" : "0 0 16px",
            background: SURFACE,
            border: `1px solid ${LINE}`,
            borderRadius: isCompact ? 8 : 12,
            padding: isCompact ? "4px 8px" : "8px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "nowrap",
          }}
        >
          {isCompact ? (
            <span>
              更新: {updatedAt && !loading ? new Date(updatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "-"}
              {saveError && <span style={{ color: PINK, marginLeft: 6, fontWeight: 700 }}>保存失敗</span>}
            </span>
          ) : (
            <span>
              しょぼいカレンダーから現在放送中のアニメ情報を取得しています(地上波・BS・CS中心、配信は登録があるものだけ)。
              {updatedAt && !loading && (
                <> 最終更新: {new Date(updatedAt).toLocaleString("ja-JP")}</>
              )}
              {saveError && <span style={{ color: PINK, marginLeft: 8, fontWeight: 700 }}>選択状態の保存に失敗しました。</span>}
            </span>
          )}
          <button
            onClick={loadPrograms}
            disabled={loading}
            style={{ ...ghostBtn, padding: isCompact ? "3px 8px" : "4px 10px", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
          >
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {!isCompact && "更新"}
          </button>
          <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
        </div>

        {fetchError && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#FFF1D6",
              color: "#8A5A00",
              border: "1px solid #F3D08A",
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: 12.5,
              marginBottom: 16,
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>データの取得に失敗しました({fetchError})。時間をおいて「更新」を押すか、エラー内容をそのまま貼って教えてください。</span>
          </div>
        )}

        {viewMode === "week" && isCompact ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {weekDays.map((cell, i) => {
              const cellKey = `${cell.year}-${String(cell.month + 1).padStart(2, "0")}-${String(cell.date).padStart(2, "0")}`;
              const evts = eventsByDate[cellKey] || [];
              const today_ = isToday(cell);
              return (
                <div
                  key={i}
                  onClick={() => evts.length > 0 && setDayDetailKey(cellKey)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 12,
                    background: SURFACE,
                    border: `1px solid ${LINE}`,
                    cursor: evts.length > 0 ? "pointer" : "default",
                  }}
                >
                  <div style={{ width: 42, flexShrink: 0, textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: WEEKDAY_COLORS[i] }}>{WEEKDAYS_JA[i]}</div>
                    <div
                      style={{
                        marginTop: 2,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        fontSize: 13,
                        fontWeight: today_ ? 800 : 600,
                        background: today_ ? PINK : "transparent",
                        color: today_ ? "#fff" : INK,
                      }}
                    >
                      {cell.date}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, paddingTop: 3 }}>
                    {evts.length === 0 ? (
                      <span style={{ fontSize: 11, color: INK_SOFT }}>予定なし</span>
                    ) : (
                      evts.map((e) => {
                        const cat = resolveStyle(e, colorOverrides);
                        return (
                          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
                            <span style={{ color: cat.color, fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                              {e.time}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                color: INK,
                                fontWeight: 600,
                              }}
                            >
                              {e.title}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: isCompact ? 3 : 6 }}>
            {WEEKDAYS_JA.map((w, i) => (
              <div
                key={w}
                style={{
                  textAlign: "center",
                  padding: isCompact ? "4px 0" : "7px 0",
                  fontSize: isCompact ? 11 : 13,
                  fontWeight: 800,
                  fontFamily: "'M PLUS Rounded 1c', sans-serif",
                  background: WEEKDAY_SOFT[i],
                  borderRadius: isCompact ? 6 : 10,
                  color: WEEKDAY_COLORS[i],
                }}
              >
                {w}
              </div>
            ))}

            {(viewMode === "week" ? [weekDays] : weeks).map((week, wi) =>
              week.map((cell, ci) => {
                const cellKey = `${cell.year}-${String(cell.month + 1).padStart(2, "0")}-${String(cell.date).padStart(2, "0")}`;
                const evts = cell.inMonth ? eventsByDate[cellKey] || [] : [];
                const today_ = isToday(cell);
                return (
                  <div
                    key={`${wi}-${ci}`}
                    onClick={() => {
                      if (isCompact && cell.inMonth && evts.length > 0) setDayDetailKey(cellKey);
                    }}
                    style={{
                      minHeight: isCompact ? (viewMode === "week" ? 130 : 66) : viewMode === "week" ? 220 : 106,
                      minWidth: 0,
                      padding: isCompact ? "3px 2px" : "8px 7px 8px",
                      borderRadius: isCompact ? 8 : 12,
                      background: cell.inMonth ? SURFACE : "transparent",
                      border: cell.inMonth ? `1px solid ${LINE}` : "1px dashed transparent",
                      boxShadow: cell.inMonth ? "0 2px 0 rgba(43,33,64,0.05)" : "none",
                      opacity: cell.inMonth ? 1 : 0.35,
                      overflow: "hidden",
                      cursor: isCompact && evts.length > 0 ? "pointer" : "default",
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: isCompact ? 18 : 24,
                        height: isCompact ? 18 : 24,
                        borderRadius: "50%",
                        fontSize: isCompact ? 10.5 : 12,
                        fontWeight: today_ ? 800 : 500,
                        background: today_ ? PINK : "transparent",
                        color: today_ ? "#fff" : WEEKDAY_COLORS[ci],
                        boxShadow: today_ ? "0 2px 0 #D62A63" : "none",
                      }}
                    >
                      {cell.date}
                    </div>

                    {isCompact ? (
                      evts.length > 0 && (
                        <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
                          {evts.slice(0, viewMode === "week" ? 8 : 3).map((e) => (
                            <div
                              key={e.id}
                              style={{
                                fontSize: 8.5,
                                lineHeight: 1.4,
                                fontWeight: 700,
                                color: resolveStyle(e, colorOverrides).color,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {truncateTitle(e.title, 5)}
                            </div>
                          ))}
                          {evts.length > (viewMode === "week" ? 8 : 3) && (
                            <div style={{ fontSize: 8.5, color: INK_SOFT, fontWeight: 700 }}>
                              +{evts.length - (viewMode === "week" ? 8 : 3)}件
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 4 }}>
                        {evts.map((e) => {
                          const cat = resolveStyle(e, colorOverrides);
                          return (
                            <div
                              key={e.id}
                              onClick={() => setDetailAnimeId(e.animeId)}
                              title={`${e.title} / ${e.chName} ${e.time}`}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: 10.5,
                                lineHeight: 1.3,
                                background: cat.soft,
                                padding: "3px 7px",
                                borderRadius: 999,
                                overflow: "hidden",
                                cursor: "pointer",
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
                              <span style={{ fontVariantNumeric: "tabular-nums", color: cat.color, fontWeight: 700, flexShrink: 0 }}>
                                {e.time}
                              </span>
                              <span style={{ minWidth: 0, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: INK }}>
                                {e.title}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {!isCompact && (
          <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {availableGroups.map((g) => (
              <div
                key={g.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  color: g.style.color,
                  background: g.style.soft,
                  padding: "4px 12px",
                  borderRadius: 999,
                }}
              >
                <span style={{ width: 8, height: 8, background: g.style.color, display: "inline-block", borderRadius: "50%" }} />
                {g.label}
              </div>
            ))}
            {availableGroups.length > 0 && (
              <button
                onClick={() => setColorPanelOpen(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: INK_SOFT,
                  background: "transparent",
                  border: `1px dashed ${LINE}`,
                  padding: "4px 10px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Palette size={12} />
                色を編集
              </button>
            )}
            <button
              onClick={() => setSyncPanelOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11.5,
                fontWeight: 700,
                color: INK_SOFT,
                background: "transparent",
                border: `1px dashed ${LINE}`,
                padding: "4px 10px",
                borderRadius: 999,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Smartphone size={12} />
              他の端末と同期
            </button>
          </div>
        )}

        {isCompact && (
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {availableGroups.length > 0 && (
              <button
                onClick={() => setColorPanelOpen(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: INK_SOFT,
                  background: "transparent",
                  border: `1px dashed ${LINE}`,
                  padding: "3px 9px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Palette size={11} />
                色を編集
              </button>
            )}
            <button
              onClick={() => setSyncPanelOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10.5,
                fontWeight: 700,
                color: INK_SOFT,
                background: "transparent",
                border: `1px dashed ${LINE}`,
                padding: "3px 9px",
                borderRadius: 999,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Smartphone size={11} />
              同期
            </button>
          </div>
        )}

        {!isCompact && (
          <div style={{ marginTop: 12, fontSize: 12, color: INK_SOFT }}>
            視聴中の作品：{selectedEvents.length > 0 ? selectedEvents.map((e) => e.title).join("、") : "まだ選択されていません"}
          </div>
        )}
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
                  現在放送中のラインナップ
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
                {availableGroups.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => setPlatformFilter(g.key)}
                    style={
                      platformFilter === g.key
                        ? { ...dayChipActive, background: g.style.color }
                        : { ...dayChip, color: g.style.color, background: g.style.soft }
                    }
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              {newCount > 0 && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 10,
                    fontSize: 12,
                    color: INK_SOFT,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newOnly}
                    onChange={(e) => setNewOnly(e.target.checked)}
                    style={{ width: 15, height: 15, accentColor: PINK, cursor: "pointer" }}
                  />
                  新番組らしき作品だけ表示({newCount}件・話数からの推測です)
                </label>
              )}
            </div>

            <div style={{ overflowY: "auto" }}>
              {loading && (
                <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>読み込み中...</div>
              )}
              {!loading && filteredList.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>
                  該当する作品がありません
                </div>
              )}
              {!loading &&
                filteredList.map((anime) => (
                  <AnimeRow
                    key={anime.id}
                    anime={anime}
                    selected={selected}
                    notify={notify}
                    isExpanded={expandedId === anime.id}
                    onToggleExpand={() => setExpandedId((prev) => (prev === anime.id ? null : anime.id))}
                    onSelectOption={selectOption}
                    onToggleNotify={toggleNotify}
                    colorOverrides={colorOverrides}
                  />
                ))}
            </div>

            <div style={{ padding: "10px 18px", borderTop: `1px solid ${LINE}`, fontSize: 11, color: INK_SOFT }}>
              通知ベルをONにした作品は、「他の端末と同期」パネルからプッシュ通知を有効にすると配信直前にお知らせが届きます。
            </div>
          </div>
        </div>
      )}

      {dayDetailKey && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(43,33,64,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 65,
            padding: 20,
          }}
          onClick={() => setDayDetailKey(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: SURFACE,
              width: "100%",
              maxWidth: 420,
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
              <div style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif", fontWeight: 800, fontSize: 17, color: "#fff" }}>
                {(() => {
                  const [y, m, d] = dayDetailKey.split("-").map(Number);
                  const wd = (new Date(y, m - 1, d).getDay() + 6) % 7;
                  return `${m}月${d}日(${WEEKDAYS_JA[wd]})`;
                })()}
              </div>
              <button
                onClick={() => setDayDetailKey(null)}
                style={{ ...iconBtn, border: "none", background: "rgba(255,255,255,0.25)", color: "#fff" }}
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ overflowY: "auto" }}>
              {(eventsByDate[dayDetailKey] || []).map((e) => {
                const cat = resolveStyle(e, colorOverrides);
                return (
                  <button
                    key={e.id}
                    onClick={() => {
                      setDetailAnimeId(e.animeId);
                      setDayDetailKey(null);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "12px 18px",
                      border: "none",
                      borderBottom: `1px solid ${LINE}`,
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: cat.color,
                        fontVariantNumeric: "tabular-nums",
                        flexShrink: 0,
                      }}
                    >
                      {e.time}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.title}
                      {e.episode && (
                        <span style={{ fontSize: 11, fontWeight: 500, color: INK_SOFT }}> 第{e.episode}話</span>
                      )}
                    </span>
                    <span style={{ fontSize: 11, color: INK_SOFT, flexShrink: 0 }}>{e.chName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {detailAnime && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(43,33,64,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: 20,
          }}
          onClick={() => setDetailAnimeId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: SURFACE,
              width: "100%",
              maxWidth: 440,
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
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: "16px 18px",
                background: PINK,
                gap: 10,
              }}
            >
              <div
                style={{
                  fontFamily: "'M PLUS Rounded 1c', sans-serif",
                  fontWeight: 800,
                  fontSize: 17,
                  color: "#fff",
                  lineHeight: 1.4,
                }}
              >
                {detailAnime.title}
              </div>
              <button
                onClick={() => setDetailAnimeId(null)}
                style={{ ...iconBtn, border: "none", background: "rgba(255,255,255,0.25)", color: "#fff", flexShrink: 0 }}
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowY: "auto" }}>
              <AnimeRow
                anime={detailAnime}
                selected={selected}
                notify={notify}
                isExpanded={true}
                onToggleExpand={() => {}}
                onSelectOption={selectOption}
                onToggleNotify={toggleNotify}
                colorOverrides={colorOverrides}
              />
            </div>
          </div>
        </div>
      )}

      {colorPanelOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(43,33,64,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 70,
            padding: 20,
          }}
          onClick={() => setColorPanelOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: SURFACE,
              width: "100%",
              maxWidth: 420,
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
                background: BLUE,
              }}
            >
              <div>
                <div style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif", fontWeight: 800, fontSize: 17, color: "#fff" }}>
                  色を編集
                </div>
                <div style={{ fontSize: 12, color: "#E4F3FF", marginTop: 2 }}>
                  局・配信サービスごとに好きな色に変更できます
                </div>
              </div>
              <button
                onClick={() => setColorPanelOpen(false)}
                style={{ ...iconBtn, border: "none", background: "rgba(255,255,255,0.25)", color: "#fff" }}
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowY: "auto", padding: "10px 18px" }}>
              {availableGroups.map((g) => (
                <div
                  key={g.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: `1px solid ${LINE}`,
                  }}
                >
                  <label
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      flexShrink: 0,
                      cursor: "pointer",
                      border: `2px solid ${LINE}`,
                      overflow: "hidden",
                      position: "relative",
                      background: g.style.color,
                    }}
                  >
                    <input
                      type="color"
                      value={g.style.color}
                      onChange={(ev) => setOneColor(g.key, ev.target.value)}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        opacity: 0,
                        cursor: "pointer",
                      }}
                    />
                  </label>
                  <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: INK }}>{g.label}</div>
                  {colorOverrides[g.key] && (
                    <button
                      onClick={() => resetOneColor(g.key)}
                      aria-label="デフォルトに戻す"
                      style={{
                        border: "none",
                        background: "transparent",
                        color: INK_SOFT,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        padding: 6,
                      }}
                    >
                      <RotateCcw size={15} />
                    </button>
                  )}
                </div>
              ))}
              {availableGroups.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>
                  まだ表示できる項目がありません
                </div>
              )}
            </div>

            <div style={{ padding: "10px 18px", borderTop: `1px solid ${LINE}`, fontSize: 11, color: INK_SOFT }}>
              丸いアイコンをタップすると色を選べます。変更はこの端末に保存されます。
            </div>
          </div>
        </div>
      )}

      {syncPanelOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(43,33,64,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 70,
            padding: 20,
          }}
          onClick={() => setSyncPanelOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: SURFACE,
              width: "100%",
              maxWidth: 420,
              maxHeight: "85vh",
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
                background: BLUE,
              }}
            >
              <div>
                <div style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif", fontWeight: 800, fontSize: 17, color: "#fff" }}>
                  他の端末と同期
                </div>
                <div style={{ fontSize: 12, color: "#E4F3FF", marginTop: 2 }}>
                  合言葉を使って選択状態を共有します
                </div>
              </div>
              <button
                onClick={() => setSyncPanelOpen(false)}
                style={{ ...iconBtn, border: "none", background: "rgba(255,255,255,0.25)", color: "#fff" }}
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "18px", overflowY: "auto" }}>
              <div style={{ fontSize: 12.5, color: INK_SOFT, lineHeight: 1.6, marginBottom: 14 }}>
                この端末の選択状態を「合言葉」に紐づけて保存できます。別の端末で同じ合言葉を入力して読み込めば、選んだ作品・通知設定・色の設定がそのまま反映されます。
              </div>

              <label style={{ fontSize: 12, fontWeight: 700, color: INK, display: "block", marginBottom: 6 }}>
                合言葉
              </label>
              <input
                value={syncCodeInput}
                onChange={(e) => setSyncCodeInput(e.target.value)}
                placeholder="例: ABC123(空欄なら新規発行)"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: `1px solid ${LINE}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: "inherit",
                  color: INK,
                  marginBottom: 12,
                }}
              />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={uploadSync}
                  disabled={syncBusy}
                  style={{
                    ...ghostBtn,
                    flex: 1,
                    background: BLUE,
                    color: "#fff",
                    border: "none",
                    justifyContent: "center",
                    opacity: syncBusy ? 0.6 : 1,
                  }}
                >
                  この端末の内容を保存
                </button>
                <button
                  onClick={downloadSync}
                  disabled={syncBusy}
                  style={{
                    ...ghostBtn,
                    flex: 1,
                    justifyContent: "center",
                    opacity: syncBusy ? 0.6 : 1,
                  }}
                >
                  合言葉から読み込む
                </button>
              </div>

              {syncCode && (
                <div style={{ marginTop: 14, fontSize: 12, color: INK_SOFT }}>
                  現在の合言葉: <span style={{ fontWeight: 700, color: INK }}>{syncCode}</span>
                </div>
              )}
              {syncMsg && (
                <div style={{ marginTop: 10, fontSize: 12.5, color: syncMsg.startsWith("エラー") ? "#C0392B" : "#1E7F4C" }}>
                  {syncMsg}
                </div>
              )}

              <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${LINE}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 6 }}>
                  配信直前のプッシュ通知
                </div>
                <div style={{ fontSize: 12, color: INK_SOFT, lineHeight: 1.6, marginBottom: 12 }}>
                  通知ベルをONにした作品について、放送・配信の10分ほど前に端末に通知を送ります。上の合言葉に紐づけて管理するので、まだ合言葉を発行していない場合はONにする際に自動で発行されます。
                </div>
                <button
                  onClick={pushEnabled ? disablePush : enablePush}
                  disabled={pushBusy}
                  style={{
                    ...ghostBtn,
                    width: "100%",
                    justifyContent: "center",
                    background: pushEnabled ? "transparent" : PINK,
                    color: pushEnabled ? INK : "#fff",
                    border: pushEnabled ? `1px solid ${LINE}` : "none",
                    opacity: pushBusy ? 0.6 : 1,
                  }}
                >
                  {pushEnabled ? "この端末の通知をOFFにする" : "この端末で通知をONにする"}
                </button>
                {pushMsg && (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: pushMsg.startsWith("エラー") ? "#C0392B" : "#1E7F4C" }}>
                    {pushMsg}
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: "10px 18px", borderTop: `1px solid ${LINE}`, fontSize: 11, color: INK_SOFT }}>
              合言葉を知っている人は誰でも読み書きできる簡易的な仕組みです。他人に推測されにくい文字列にしてください。
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
  background: "#F1EEF5",
  color: "#5B5470",
};

const dayChipActive = {
  ...dayChip,
  color: "#fff",
  background: "#2B2140",
};
