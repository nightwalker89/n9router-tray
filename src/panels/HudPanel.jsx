/**
 * Activity HUD — small always-on-top floating widget.
 * Glanceable live n9router routing: in-flight requests, recent stream,
 * recent provider+model, token usage. Constrained auto-rotating tabs with
 * direction-aware slide, labeled sub-header, and ←/→ keyboard navigation.
 * Data: api.getUsageStats (no backend changes). Polls only while visible.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, PhysicalPosition, PhysicalSize, LogicalSize } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";
import { api } from "../api/client";
import { formatTokens, shortModel, formatTime, timeAgo } from "../utils/format";
import { DEFAULT_HUD_PRESET, resolveHudPreset } from "../hud/presets";

const TABS = ["live", "recent", "feed", "providers", "models"];
const META = {
  live:      { label: "Live Activity",    icon: ActivityIcon },
  recent:    { label: "Recent",           icon: ClockIcon },
  feed:      { label: "Recent Requests",  icon: ListIcon },
  providers: { label: "By Provider",      icon: ServerIcon },
  models:    { label: "Top Models",       icon: ChipIcon },
};
const POLL_MS = 2500;
const ROTATE_MS = 7000;
const IDLE_RESUME_MS = 15000;
const DEFAULT_SIZE = { w: 440, h: 600 }; // must match build_hud_window inner_size

export default function HudPanel() {
  const [stats, setStats] = useState(null);
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState("live");
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const [bgAlpha, setBgAlpha] = useState(0.95);
  const [preset, setPreset] = useState(DEFAULT_HUD_PRESET);
  const [pointerActive, setPointerActive] = useState(false);
  const [windowFocused, setWindowFocused] = useState(() => document.hasFocus());
  const hovering = useRef(false);
  const lastInteraction = useRef(0);
  const inFlight = useRef(false);

  // ── Position + size persistence (store-based) ──
  useEffect(() => {
    const unlisteners = [];
    (async () => {
      try {
        const store = await load("tray-settings.json", { autoSave: false });
        const win = getCurrentWindow();

        // Restore size first so position anchoring uses the final geometry.
        const size = await store.get("hudSize");
        if (size && Number.isFinite(size.w) && Number.isFinite(size.h)) {
          await win.setSize(new PhysicalSize(size.w, size.h));
        }
        const pos = await store.get("hudPos");
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
          await win.setPosition(new PhysicalPosition(pos.x, pos.y));
        }

        let mt;
        unlisteners.push(await win.onMoved(({ payload }) => {
          clearTimeout(mt);
          mt = setTimeout(async () => {
            await store.set("hudPos", { x: payload.x, y: payload.y });
            await store.save();
          }, 400);
        }));

        let rt;
        unlisteners.push(await win.onResized(({ payload }) => {
          clearTimeout(rt);
          rt = setTimeout(async () => {
            await store.set("hudSize", { w: payload.width, h: payload.height });
            await store.save();
          }, 400);
        }));
      } catch { /* ignore */ }
    })();
    return () => unlisteners.forEach((u) => u && u());
  }, []);

  // ── Active HUD should be fully readable while focused or under pointer/touch ──
  useEffect(() => {
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // ── HUD opacity (live, cross-window via store change events) ──
  useEffect(() => {
    let unlisten;
    const apply = (pct) => {
      const v = Number.isFinite(pct) ? pct : 95;
      setBgAlpha(Math.max(0.3, Math.min(1, v / 100)));
    };
    (async () => {
      try {
        const store = await load("tray-settings.json", { autoSave: false });
        apply(await store.get("hudOpacity"));
        unlisten = await store.onKeyChange("hudOpacity", apply);
      } catch { /* ignore */ }
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // ── HUD color preset (live, cross-window via store change events) ──
  useEffect(() => {
    let unlisten;
    (async () => {
      try {
        const store = await load("tray-settings.json", { autoSave: false });
        setPreset(resolveHudPreset(await store.get("hudPreset")));
        unlisten = await store.onKeyChange("hudPreset", (v) => setPreset(resolveHudPreset(v)));
      } catch { /* ignore */ }
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // ── Polling (paused when hidden) ──
  const poll = useCallback(async () => {
    if (inFlight.current || document.hidden) return;
    inFlight.current = true;
    try {
      const data = await api.getUsageStats("24h");
      setStats(data);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    const onVis = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [poll]);

  const active = stats?.activeRequests || [];
  const recent = stats?.recentRequests || [];

  const go = useCallback((next, d) => { setDir(d); setTab(next); }, []);
  const step = useCallback((d) => {
    lastInteraction.current = Date.now();
    const i = TABS.indexOf(tab);
    go(TABS[(i + d + TABS.length) % TABS.length], d);
  }, [tab, go]);
  const jump = (t) => {
    lastInteraction.current = Date.now();
    go(t, TABS.indexOf(t) >= TABS.indexOf(tab) ? 1 : -1);
  };

  // ── Manual resize for the borderless window (grip + dbl-click reset) ──
  const startResize = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    getCurrentWindow().startResizeDragging("SouthEast").catch(() => {});
  }, []);
  const resetSize = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    getCurrentWindow().setSize(new LogicalSize(DEFAULT_SIZE.w, DEFAULT_SIZE.h)).catch(() => {});
  }, []);

  // ── Keyboard ←/→ ──
  useEffect(() => {
    const h = (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [step]);

  // ── Constrained auto-rotate ──
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (hovering.current) return;
      if (Date.now() - lastInteraction.current < IDLE_RESUME_MS) return;
      if (tab === "live" && active.length > 0) return; // sticky Live
      go(TABS[(TABS.indexOf(tab) + 1) % TABS.length], 1);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [tab, active.length, go, paused]);

  const lastReq = recent[0];
  const totalTokens = (stats?.totalPromptTokens || 0) + (stats?.totalCompletionTokens || 0);
  const errorProvider = stats?.errorProvider;
  const TabIcon = META[tab].icon;
  const hudOpacity = pointerActive || windowFocused ? 1 : bgAlpha;
  const tabCount =
    tab === "live" ? active.length :
    tab === "recent" || tab === "feed" ? recent.length :
    tab === "providers" ? Object.keys(stats?.byProvider || {}).length :
    Object.keys(stats?.byModel || {}).length;

  return (
    <div
      className="hud-root"
      data-hud-preset={preset}
      style={{ "--hud-opacity": hudOpacity }}
      onMouseEnter={() => { hovering.current = true; setPointerActive(true); }}
      onMouseLeave={() => { hovering.current = false; setPointerActive(false); }}
      onPointerDown={() => setPointerActive(true)}
      onTouchStart={() => setPointerActive(true)}
      onTouchEnd={() => setPointerActive(false)}
      onTouchCancel={() => setPointerActive(false)}
    >
      {/* Header (draggable) */}
      <div className="hud-header" data-tauri-drag-region>
        <span className={`hud-live-dot ${active.length ? "on" : ""}`} data-tauri-drag-region />
        <div className="hud-header-info" data-tauri-drag-region>
          <span className="hud-model" data-tauri-drag-region>{lastReq ? shortModel(lastReq.model) : "Activity HUD"}</span>
          <span className="hud-provider" data-tauri-drag-region>{lastReq?.provider || "waiting for traffic"}</span>
        </div>
        <div className="hud-token-pill" data-tauri-drag-region title="Tokens (24h)">{formatTokens(totalTokens)}</div>
        <button className="hud-icon-btn hud-close" title="Hide HUD" onClick={hideHud}>
          <CloseIcon />
        </button>
      </div>

      {/* Sub-header — labels the current tab + rotation progress */}
      <div className="hud-subheader">
        <span className="hud-tab-icon"><TabIcon /></span>
        <span className="hud-tab-name">{META[tab].label}</span>
        {tabCount > 0 && <span className="hud-tab-count">{tabCount}</span>}
        <button
          className={`hud-icon-btn hud-playpause ${paused ? "is-paused" : ""}`}
          title={paused ? "Resume auto-rotate" : "Pause auto-rotate"}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
      </div>
      <div className="hud-progress-track">
        <div
          className={`hud-progress-fill ${paused ? "paused" : ""}`}
          key={`${tab}-${paused}`}
          style={{ animationDuration: `${ROTATE_MS}ms` }}
        />
      </div>

      {errorProvider && <div className="hud-error-chip"><AlertIcon /> {errorProvider} error</div>}

      {/* Body with direction-aware slide */}
      <div className="hud-body">
        <div className="hud-slide" key={tab} data-dir={dir}>
          {offline ? (
            <div className="hud-state"><OfflineIcon /><span>n9router offline</span></div>
          ) : tab === "live" ? (
            active.length === 0
              ? <div className="hud-state"><PulseIcon /><span>No active requests</span></div>
              : active.slice(0, 6).map((r, i) => (
                  <div className="hud-row" key={i}>
                    <span className="hud-dot pulse" />
                    <div className="hud-row-body">
                      <span className="hud-row-main">{shortModel(r.model)}</span>
                      <span className="hud-row-sub">{r.provider} · {r.account}</span>
                    </div>
                    <span className="hud-badge">×{r.count}</span>
                  </div>
                ))
          ) : tab === "recent" ? (
            recent.length === 0
              ? <div className="hud-state"><ClockIcon /><span>No recent activity</span></div>
              : recent.slice(0, 6).map((r, i) => {
                  const ok = r.status === "ok" || r.status === "success";
                  return (
                    <div className="hud-row" key={i}>
                      <span className={`hud-status-bar ${ok ? "ok" : "err"}`} />
                      <div className="hud-row-body">
                        <span className="hud-row-main">{shortModel(r.model)}</span>
                        <span className="hud-row-sub">{r.provider} · {formatTime(r.timestamp)}</span>
                      </div>
                      <span className="hud-tok">
                        <b>{formatTokens(r.promptTokens)}</b>→<b>{formatTokens(r.completionTokens)}</b>
                      </span>
                    </div>
                  );
                })
          ) : tab === "feed" ? (
            recent.length === 0
              ? <div className="hud-state"><ListIcon /><span>No requests yet</span></div>
              : (
                <>
                  <div className="hud-feed-head">
                    <span className="hud-feed-model">Model</span>
                    <span className="hud-feed-io">In / Out</span>
                    <span className="hud-feed-when">When</span>
                  </div>
                  {recent.slice(0, 12).map((r, i) => {
                    const ok = !r.status || r.status === "ok" || r.status === "success";
                    return (
                      <div className="hud-feed-row" key={i}>
                        <span className={`hud-feed-dot ${ok ? "ok" : "err"}`} />
                        <span className="hud-feed-model" title={r.model}>{shortModel(r.model)}</span>
                        <span className="hud-feed-io">
                          <b className="in">{formatTokens(r.promptTokens)}↑</b>{" "}
                          <b className="out">{formatTokens(r.completionTokens)}↓</b>
                        </span>
                        <span className="hud-feed-when" title={formatTime(r.timestamp)}>{timeAgo(r.timestamp)}</span>
                      </div>
                    );
                  })}
                </>
              )
          ) : tab === "providers" ? (
            barRows(stats?.byProvider, (v) => (v.promptTokens || 0) + (v.completionTokens || 0), formatTokens)
          ) : (
            barRows(stats?.byModel, (v) => v.requests, (n) => `${n} req`, (name, v) => shortModel(v.rawModel || name))
          )}
        </div>
      </div>

      {/* Tab dots */}
      <div className="hud-dots">
        {TABS.map((t) => (
          <button
            key={t}
            className={`hud-dot-btn ${tab === t ? "active" : ""}`}
            title={META[t].label}
            onClick={() => jump(t)}
          />
        ))}
      </div>

      {/* Resize grip (borderless window needs a manual handle) */}
      <div
        className="hud-resize-grip"
        title="Drag to resize · double-click to reset"
        onPointerDown={startResize}
        onDoubleClick={resetSize}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <line x1="11" y1="5" x2="5" y2="11" />
          <line x1="11" y1="9" x2="9" y2="11" />
        </svg>
      </div>
    </div>
  );
}

async function hideHud() {
  try {
    await invoke("close_hud_window");
    const store = await load("tray-settings.json", { autoSave: false });
    await store.set("showHud", false);
    await store.save();
  } catch { /* ignore */ }
}

/** Render ranked rows with a relative-strength bar. */
function barRows(obj, metric, fmt, labeler) {
  const entries = Object.entries(obj || {})
    .map(([name, v]) => ({ name, v, m: metric(v) }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 6);
  if (entries.length === 0) return <div className="hud-state"><span>No data yet</span></div>;
  const max = entries[0].m || 1;
  return entries.map(({ name, v, m }) => (
    <div className="hud-bar-row" key={name}>
      <div className="hud-bar-top">
        <span className="hud-row-main">{labeler ? labeler(name, v) : name}</span>
        <span className="hud-row-sub">{v.requests} req · {fmt(m)}</span>
      </div>
      <div className="hud-bar-track">
        <div className="hud-bar-fill" style={{ width: `${Math.max(6, (m / max) * 100)}%` }} />
      </div>
    </div>
  ));
}

/* ── Inline icons (Lucide-style, 14px, stroke currentColor) ── */
function svg(children, size = 14) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
function ActivityIcon() { return svg(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />); }
function ClockIcon() { return svg(<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>); }
function ServerIcon() { return svg(<><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><line x1="7" y1="7.5" x2="7" y2="7.5" /><line x1="7" y1="16.5" x2="7" y2="16.5" /></>); }
function ChipIcon() { return svg(<><rect x="7" y="7" width="10" height="10" rx="1.5" /><line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" /></>); }
function ListIcon() { return svg(<><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>); }
function CloseIcon() { return svg(<><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>, 12); }
function PauseIcon() { return svg(<><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>, 12); }
function PlayIcon() { return svg(<polygon points="7 5 19 12 7 19 7 5" fill="currentColor" stroke="none" />, 12); }
function AlertIcon() { return svg(<><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>, 12); }
function PulseIcon() { return svg(<path d="M3 12h4l3 8 4-16 3 8h4" />, 20); }
function OfflineIcon() { return svg(<><path d="M2 8.5a16 16 0 0 1 20 0" /><line x1="2" y1="2" x2="22" y2="22" /><path d="M12 20h.01" /></>, 20); }
