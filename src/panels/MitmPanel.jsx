import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { ToolIcon, AntigravityIcon } from "../components/BrandIcons";

const TOOLS = [
  { id: "antigravity", label: "Antigravity" },
  { id: "cursor",      label: "Cursor" },
  { id: "codex",       label: "Codex" },
  { id: "kiro",        label: "Kiro" },
  { id: "copilot",     label: "Copilot" },
];

// ── Mode A/B Selector ───────────────────────────────────────────────────────

function ModeSelector({ mode, loading, onChange }) {
  return (
    <div style={{
      display: "flex", borderRadius: 8, overflow: "hidden",
      border: "1px solid var(--border-light)",
      opacity: loading ? 0.6 : 1,
      pointerEvents: loading ? "none" : "auto",
    }}>
      <button
        onClick={() => onChange("A")}
        style={{
          flex: 1, padding: "8px 0", fontSize: 10, fontWeight: 600,
          border: "none", cursor: "pointer",
          background: mode === "A" ? "rgba(59,130,246,0.15)" : "var(--bg-tertiary)",
          color: mode === "A" ? "#3B82F6" : "var(--text-tertiary)",
          borderRight: "1px solid var(--border-light)",
          transition: "all 0.15s ease",
        }}
      >
        <div style={{ fontSize: 13, marginBottom: 2 }}>🔀</div>
        <div>Mode A</div>
        <div style={{ fontSize: 8, fontWeight: 400, marginTop: 1, opacity: 0.7 }}>Model Routing</div>
      </button>
      <button
        onClick={() => onChange("B")}
        style={{
          flex: 1, padding: "8px 0", fontSize: 10, fontWeight: 600,
          border: "none", cursor: "pointer",
          background: mode === "B" ? "rgba(139,92,246,0.15)" : "var(--bg-tertiary)",
          color: mode === "B" ? "#8B5CF6" : "var(--text-tertiary)",
          transition: "all 0.15s ease",
        }}
      >
        <div style={{ fontSize: 13, marginBottom: 2 }}>🔄</div>
        <div>Mode B</div>
        <div style={{ fontSize: 8, fontWeight: 400, marginTop: 1, opacity: 0.7 }}>Token Swap</div>
      </button>
    </div>
  );
}

function ModeDescription({ mode }) {
  if (mode === "B") {
    return (
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 6,
        padding: "6px 10px", borderRadius: 6,
        background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)",
        fontSize: 10, color: "rgba(139,92,246,0.85)", lineHeight: 1.4,
      }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}>ℹ️</span>
        <span>
          <strong>Token Rotation</strong> — rotates auth tokens across your Antigravity account pool.
          Model routing (Mode A) is bypassed when active.
        </span>
      </div>
    );
  }
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 6,
      padding: "6px 10px", borderRadius: 6,
      background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)",
      fontSize: 10, color: "rgba(59,130,246,0.85)", lineHeight: 1.4,
    }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>ℹ️</span>
      <span>
        <strong>Model Routing</strong> — remap model IDs in intercepted Antigravity requests via configured model mappings.
      </span>
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────────

export default function MitmPanel() {
  const { data: status, error, refetch } = usePolling(api.getMitmStatus, 5000);
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [pendingAction, setPendingAction] = useState(null);

  // Antigravity app state (polled via Rust)
  const [agStatus, setAgStatus] = useState(null); // { running, pid, installed }
  const [agLoading, setAgLoading] = useState(null); // "launch"|"quit"|"restart"
  const [agError, setAgError] = useState(null);

  // Mode A/B state
  const [tokenSwapEnabled, setTokenSwapEnabled] = useState(null); // null = loading
  const [modeLoading, setModeLoading] = useState(false);

  const isRunning = status?.running;
  const hasCachedPassword = status?.hasCachedPassword;
  const currentMode = tokenSwapEnabled ? "B" : "A";

  // Fetch settings for mode A/B
  useEffect(() => {
    let active = true;
    const fetchSettings = async () => {
      try {
        const s = await api.getSettings();
        if (active) setTokenSwapEnabled(!!s.tokenSwapEnabled);
      } catch { /* ignore — settings may need auth */ }
    };
    fetchSettings();
    const id = setInterval(fetchSettings, 15000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Poll Antigravity app status every 5s via Rust command
  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const s = await invoke("antigravity_status");
        if (active) setAgStatus(s);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // ── Mode switch ─────────────────────────────────────────────────────────
  const handleModeChange = useCallback(async (mode) => {
    const newEnabled = mode === "B";
    if (tokenSwapEnabled === newEnabled) return;

    setModeLoading(true);
    setTokenSwapEnabled(newEnabled); // optimistic
    try {
      await api.updateSettings({ tokenSwapEnabled: newEnabled });
    } catch (e) {
      setTokenSwapEnabled(!newEnabled); // rollback
      setActionError(`Mode switch failed: ${e.message}`);
    } finally {
      setModeLoading(false);
    }
  }, [tokenSwapEnabled]);

  // ── MITM Actions ──────────────────────────────────────────────────────────
  const doAction = useCallback(async (action, pwd) => {
    setActionError(null);
    setActionLoading(action);
    try {
      if (action === "start") {
        await api.startMitm("sk_9router", pwd || "");
      } else if (action === "stop") {
        await api.stopMitm(pwd || "");
      } else {
        const [dnsAction, tool] = action.split(":");
        await api.toggleDNS(tool, dnsAction, pwd || "");
      }
      setShowPassword(false);
      setPassword("");
      await refetch();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setActionLoading(null);
    }
  }, [refetch]);

  const handleAction = useCallback((action) => {
    setActionError(null);
    if (hasCachedPassword) {
      doAction(action, "");
    } else {
      setPendingAction(action);
      setShowPassword(true);
    }
  }, [hasCachedPassword, doAction]);

  const handlePasswordSubmit = useCallback(() => {
    if (!password.trim()) return;
    doAction(pendingAction, password);
  }, [password, pendingAction, doAction]);

  const handleToggleDNS = useCallback((tool) => {
    const currentlyActive = status?.dnsStatus?.[tool];
    handleAction(`${currentlyActive ? "disable" : "enable"}:${tool}`);
  }, [status, handleAction]);

  // ── Antigravity App Actions (via Rust) ────────────────────────────────────
  const handleAgAction = useCallback(async (action) => {
    setAgError(null);
    setAgLoading(action);
    try {
      if (action === "launch") {
        await invoke("antigravity_launch");
      } else if (action === "quit") {
        await invoke("antigravity_quit");
      } else if (action === "restart") {
        await invoke("antigravity_restart");
      }
      // Refresh status after brief delay
      setTimeout(async () => {
        const s = await invoke("antigravity_status");
        setAgStatus(s);
        setAgLoading(null);
      }, 1200);
    } catch (e) {
      setAgError(typeof e === "string" ? e : (e?.message || "Action failed"));
      setAgLoading(null);
    }
  }, []);

  if (error && !status) {
    return (
      <div className="offline-overlay">
        <div className="offline-icon">📡</div>
        <div className="offline-title">n9router Not Running</div>
        <div className="offline-subtitle">Start n9router on port 20128 to use MITM controls</div>
        <button className="retry-button" onClick={refetch}>Retry</button>
      </div>
    );
  }

  const agRunning = agStatus?.running;
  const agInstalled = agStatus?.installed !== false;

  return (
    <div>
      {/* Action Error */}
      {actionError && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{actionError}</span>
        </div>
      )}

      {/* ── MITM Server Card ── */}
      <div className="section">
        <div className="card">
          <div className="toggle-row">
            <div className="toggle-label">
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(255,69,58,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                🛡️
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>MITM Proxy</div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 1 }}>
                  {isRunning ? `PID ${status?.pid || "—"}` : "Stopped"}
                  {status?.certTrusted && " • Cert ✓"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {isRunning ? (
                <span className="badge green"><span className="dot pulse" /> Running</span>
              ) : (
                <span className="badge gray">Off</span>
              )}
              <button
                className={`toggle-switch ${isRunning ? "on" : ""} ${actionLoading === "start" || actionLoading === "stop" ? "loading" : ""}`}
                onClick={() => handleAction(isRunning ? "stop" : "start")}
                disabled={!!actionLoading}
              />
            </div>
          </div>

          {/* Cert status row */}
          {status && (
            <div style={{ display: "flex", gap: 12, padding: "6px 12px 2px", fontSize: 11 }}>
              <span style={{ color: status.certExists ? "var(--green)" : "var(--text-tertiary)" }}>
                {status.certExists ? "✓" : "✗"} Cert
              </span>
              <span style={{ color: status.certTrusted ? "var(--green)" : "var(--text-tertiary)" }}>
                {status.certTrusted ? "✓" : "✗"} Trusted
              </span>
              <span style={{ color: isRunning ? "var(--green)" : "var(--text-tertiary)" }}>
                {isRunning ? "✓" : "✗"} Server
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Antigravity App Controls ── */}
      {agInstalled && (
        <div className="section">
          <div className="section-header">Antigravity App</div>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <AntigravityIcon size={28} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Antigravity</div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                  {agStatus === null ? "Checking..." : agRunning ? `Running · PID ${agStatus?.pid || "—"}` : "Not running"}
                </div>
              </div>
              {agStatus !== null && (
                agRunning ? (
                  <span className="badge green"><span className="dot pulse" /> On</span>
                ) : (
                  <span className="badge gray">Off</span>
                )
              )}
            </div>

            {agError && (
              <div className="error-banner" style={{ marginBottom: 8 }}>
                <span>⚠️</span><span>{agError}</span>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 6 }}>
              {!agRunning ? (
                <button
                  className="ag-btn ag-btn-green"
                  onClick={() => handleAgAction("launch")}
                  disabled={!!agLoading}
                >
                  {agLoading === "launch" ? <span className="spinner" /> : "▶ Launch"}
                </button>
              ) : (
                <>
                  <button
                    className="ag-btn ag-btn-yellow"
                    onClick={() => handleAgAction("restart")}
                    disabled={!!agLoading}
                  >
                    {agLoading === "restart" ? <span className="spinner" /> : "↺ Restart"}
                  </button>
                  <button
                    className="ag-btn ag-btn-red"
                    onClick={() => handleAgAction("quit")}
                    disabled={!!agLoading}
                  >
                    {agLoading === "quit" ? <span className="spinner" /> : "■ Quit"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Mode A / B Selector (Antigravity only) ── */}
      <div className="section">
        <div className="section-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Antigravity Mode</span>
          {tokenSwapEnabled !== null && (
            <span className={`badge ${currentMode === "B" ? "purple" : "blue"}`} style={{ fontSize: 9 }}>
              {currentMode === "B" ? "Token Swap" : "Model Routing"}
            </span>
          )}
        </div>
        <div className="card" style={{ padding: 10 }}>
          {tokenSwapEnabled === null ? (
            <div style={{ textAlign: "center", padding: 8 }}><span className="spinner" /></div>
          ) : (
            <>
              <ModeSelector mode={currentMode} loading={modeLoading} onChange={handleModeChange} />
              <div style={{ marginTop: 8 }}>
                <ModeDescription mode={currentMode} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── DNS Routing ── */}
      <div className="section">
        <div className="section-header">DNS Routing</div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {TOOLS.map((tool) => {
            const active = status?.dnsStatus?.[tool.id] || false;
            const isToolLoading =
              actionLoading === `enable:${tool.id}` ||
              actionLoading === `disable:${tool.id}`;
            return (
              <div className="toggle-row" key={tool.id}>
                <div className="toggle-label">
                  <ToolIcon tool={tool.id} size={22} />
                  <span>{tool.label}</span>
                </div>
                <button
                  className={`toggle-switch ${active ? "on" : ""} ${isToolLoading ? "loading" : ""} ${!isRunning ? "disabled" : ""}`}
                  onClick={() => handleToggleDNS(tool.id)}
                  disabled={!isRunning || !!actionLoading}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sudo Password Prompt ── */}
      {showPassword && (
        <div className="password-prompt">
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
            🔐 Sudo Password Required
          </div>
          <input
            type="password"
            placeholder="Enter sudo password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
            autoFocus
          />
          <div className="prompt-actions">
            <button onClick={() => { setShowPassword(false); setPassword(""); }}>Cancel</button>
            <button className="primary" onClick={handlePasswordSubmit} disabled={!!actionLoading}>
              {actionLoading ? <span className="spinner" /> : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
