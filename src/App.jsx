import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { api } from "./api/client";
import MitmPanel from "./panels/MitmPanel";
import ProvidersPanel from "./panels/ProvidersPanel";
import UsagePanel from "./panels/UsagePanel";
import SettingsPanel from "./panels/SettingsPanel";
import TerminalPanel from "./panels/TerminalPanel";
import { useAutoStart } from "./hooks/useAutoStart";

// ── Hash routing — terminal window is a separate Tauri window at /#terminal ──
const isTerminalWindow = window.location.hash === "#terminal";

const TABS = [
  { id: "mitm",      label: "MITM",      icon: "🛡️" },
  { id: "providers", label: "Providers", icon: "🔌" },
  { id: "usage",     label: "Usage",     icon: "📊" },
];

// ── Status Bar ──────────────────────────────────────────────────────────────

function StatusBar() {
  const [status, setStatus]       = useState(null);
  const [loading, setLoading]     = useState(null);
  const [error, setError]         = useState(null);
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const s = await invoke("n9router_status");
        if (active) setStatus(s);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const handleStart = useCallback(async () => {
    setError(null);
    setLoading("start");
    try {
      const store = await load("tray-settings.json", { autoSave: false });
      const force = await store.get("killPortBeforeStart");
      await invoke("n9router_start", { force: !!force });
      setTimeout(async () => {
        try { setStatus(await invoke("n9router_status")); } catch {}
        setLoading(null);
      }, 2500);
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to start");
      setLoading(null);
    }
  }, []);

  const handleStop = useCallback(async () => {
    setError(null);
    setLoading("stop");
    setConfirmStop(false);
    try {
      await invoke("n9router_stop");
      setTimeout(async () => {
        try { setStatus(await invoke("n9router_status")); } catch {}
        setLoading(null);
      }, 1500);
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to stop");
      setLoading(null);
    }
  }, []);

  const openLogs = useCallback(async () => {
    try { await invoke("open_terminal_window"); } catch (e) { console.error(e); }
  }, []);

  const running = status?.running;
  const pid     = status?.pid;

  return (
    <div className="status-bar">
      {/* Confirm stop overlay */}
      {confirmStop && (
        <div className="status-bar-confirm">
          <span style={{ fontSize: 11, color: "var(--text-primary)" }}>Stop n9router?</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="status-bar-btn status-bar-btn-danger" onClick={handleStop}>Confirm</button>
            <button className="status-bar-btn" onClick={() => setConfirmStop(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && !confirmStop && (
        <div className="status-bar-error" onClick={() => setError(null)}>
          ⚠️ {error}
        </div>
      )}

      {/* Normal status bar */}
      {!confirmStop && !error && (
        <>
          <div className="status-bar-left">
            <div className={`status-bar-dot ${running ? "online" : "offline"}`} />
            <span className="status-bar-label">
              {status === null ? "..." : running ? `n9router · PID ${pid}` : "n9router offline"}
            </span>
          </div>
          <div className="status-bar-right">
            {/* Log window button */}
            <button
              className="status-bar-btn status-bar-btn-log"
              onClick={openLogs}
              title="Open n9router log window"
            >
              📋
            </button>

            {loading ? (
              <span className="spinner" style={{ width: 12, height: 12 }} />
            ) : running ? (
              <button
                className="status-bar-btn status-bar-btn-danger"
                onClick={() => setConfirmStop(true)}
              >
                ■ Stop
              </button>
            ) : (
              <button
                className="status-bar-btn status-bar-btn-start"
                onClick={handleStart}
                disabled={status?.installed === false}
                title={status?.installed === false ? "n9router CLI not installed" : "Start n9router"}
              >
                ▶ Start
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Terminal standalone window ────────────────────────────────────────────────

function TerminalWindow() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <TerminalPanel />
    </div>
  );
}

// ── Main tray app ─────────────────────────────────────────────────────────────

function TrayApp() {
  const [activeTab, setActiveTab] = useState("mitm");
  const [serverOnline, setServerOnline] = useState(null);

  // Auto-start n9router if configured in tray settings
  useAutoStart();

  // Health check every 10s
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        await api.health();
        if (active) setServerOnline(true);
      } catch {
        if (active) setServerOnline(false);
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Settings tab — always available (doesn't need server)
  if (activeTab === "settings") {
    return (
      <div className="app-container">
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="panel-content">
          <SettingsPanel />
        </div>
        <StatusBar />
      </div>
    );
  }

  // Server offline
  if (serverOnline === false) {
    return (
      <div className="app-container">
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="offline-overlay">
          <div className="offline-icon">📡</div>
          <div className="offline-title">n9router Not Running</div>
          <div className="offline-subtitle">
            Start n9router on port 20128 to use the control panel
          </div>
          <button
            className="retry-button"
            onClick={async () => {
              try { await api.health(); setServerOnline(true); }
              catch { setServerOnline(false); }
            }}
          >
            Retry Connection
          </button>
        </div>
        <StatusBar />
      </div>
    );
  }

  // Loading
  if (serverOnline === null) {
    return (
      <div className="app-container">
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="offline-overlay">
          <div className="spinner" style={{ width: 24, height: 24 }} />
          <div className="offline-subtitle">Connecting to n9router...</div>
        </div>
        <StatusBar />
      </div>
    );
  }

  return (
    <div className="app-container">
      <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="panel-content" key={activeTab}>
        {activeTab === "mitm"      && <MitmPanel />}
        {activeTab === "providers" && <ProvidersPanel />}
        {activeTab === "usage"     && <UsagePanel />}
      </div>

      <StatusBar />
    </div>
  );
}

// ── Tab Bar (shared) ─────────────────────────────────────────────────────────

function TabBar({ activeTab, setActiveTab }) {
  return (
    <div className="tab-bar">
      <span className="tab-bar-title">n9</span>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="tab-icon">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
      {/* Spacer pushes gear to the right */}
      <div style={{ flex: 1 }} />
      {/* Gear — icon only, no label */}
      <button
        className={`tab-button tab-gear ${activeTab === "settings" ? "active" : ""}`}
        onClick={() => setActiveTab("settings")}
        title="Settings"
      >
        ⚙️
      </button>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  if (isTerminalWindow) return <TerminalWindow />;
  return <TrayApp />;
}
