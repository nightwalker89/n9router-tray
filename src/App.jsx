import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api } from "./api/client";
import MitmPanel from "./panels/MitmPanel";
import ProvidersPanel from "./panels/ProvidersPanel";
import UsagePanel from "./panels/UsagePanel";

const TABS = [
  { id: "mitm", label: "MITM", icon: "🛡️" },
  { id: "providers", label: "Providers", icon: "🔌" },
  { id: "usage", label: "Usage", icon: "📊" },
];

// ── Status Bar ──────────────────────────────────────────────────────────────

function StatusBar() {
  const [status, setStatus] = useState(null); // { running, pid, installed }
  const [loading, setLoading] = useState(null); // "start" | "stop"
  const [error, setError] = useState(null);
  const [confirmStop, setConfirmStop] = useState(false);

  // Poll n9router status every 5s
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
      await invoke("n9router_start");
      // Wait for process to boot, then re-check
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

  const running = status?.running;
  const pid = status?.pid;

  return (
    <div className="status-bar">
      {/* Confirm stop overlay */}
      {confirmStop && (
        <div className="status-bar-confirm">
          <span style={{ fontSize: 11, color: "var(--text-primary)" }}>Stop n9router?</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="status-bar-btn status-bar-btn-danger" onClick={handleStop}>
              Confirm
            </button>
            <button className="status-bar-btn" onClick={() => setConfirmStop(false)}>
              Cancel
            </button>
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

// ── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState("mitm");
  const [serverOnline, setServerOnline] = useState(null); // null = checking

  // Health check — every 10s
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

  // Server offline overlay
  if (serverOnline === false) {
    return (
      <div className="app-container">
        <div className="tab-bar">
          <span className="tab-bar-title">n9 Control</span>
        </div>
        <div className="offline-overlay">
          <div className="offline-icon">📡</div>
          <div className="offline-title">n9router Not Running</div>
          <div className="offline-subtitle">
            Start n9router on port 20128 to use the control panel
          </div>
          <button
            className="retry-button"
            onClick={async () => {
              try {
                await api.health();
                setServerOnline(true);
              } catch {
                setServerOnline(false);
              }
            }}
          >
            Retry Connection
          </button>
        </div>
        <StatusBar />
      </div>
    );
  }

  // Loading state
  if (serverOnline === null) {
    return (
      <div className="app-container">
        <div className="tab-bar">
          <span className="tab-bar-title">n9 Control</span>
        </div>
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
      {/* Tab Bar */}
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
      </div>

      {/* Panel Content */}
      <div className="panel-content" key={activeTab}>
        {activeTab === "mitm" && <MitmPanel />}
        {activeTab === "providers" && <ProvidersPanel />}
        {activeTab === "usage" && <UsagePanel />}
      </div>

      {/* Bottom Status Bar */}
      <StatusBar />
    </div>
  );
}
