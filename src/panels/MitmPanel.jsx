import { useState, useCallback } from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";

const TOOLS = [
  { id: "antigravity", label: "Antigravity", icon: "🔮" },
  { id: "cursor", label: "Cursor", icon: "📝" },
  { id: "codex", label: "Codex", icon: "⚡" },
  { id: "kiro", label: "Kiro", icon: "🪁" },
  { id: "copilot", label: "Copilot", icon: "🤖" },
];

export default function MitmPanel() {
  const { data: status, error, refetch } = usePolling(api.getMitmStatus, 5000);
  const [actionLoading, setActionLoading] = useState(null); // "start" | "stop" | tool id
  const [actionError, setActionError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [pendingAction, setPendingAction] = useState(null);

  const isRunning = status?.running;
  const hasCachedPassword = status?.hasCachedPassword;

  const doAction = useCallback(async (action, pwd) => {
    setActionError(null);
    setActionLoading(action);
    try {
      if (action === "start") {
        await api.startMitm("sk_9router", pwd || "");
      } else if (action === "stop") {
        await api.stopMitm(pwd || "");
      } else {
        // DNS toggle — action is like "enable:cursor"
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

  const handleToggleServer = useCallback(() => {
    handleAction(isRunning ? "stop" : "start");
  }, [isRunning, handleAction]);

  const handleToggleDNS = useCallback((tool) => {
    const currentlyActive = status?.dnsStatus?.[tool];
    handleAction(`${currentlyActive ? "disable" : "enable"}:${tool}`);
  }, [status, handleAction]);

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

  return (
    <div>
      {/* Action Error */}
      {actionError && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{actionError}</span>
        </div>
      )}

      {/* Server Toggle */}
      <div className="section">
        <div className="card">
          <div className="toggle-row">
            <div className="toggle-label">
              <span className="icon">🛡️</span>
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
                onClick={handleToggleServer}
                disabled={!!actionLoading}
              />
            </div>
          </div>

          {/* Cert indicators */}
          {status && (
            <div style={{ display: "flex", gap: 12, padding: "6px 12px 0", fontSize: 11 }}>
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

      {/* DNS Routing */}
      <div className="section">
        <div className="section-header">DNS Routing</div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {TOOLS.map((tool) => {
            const active = status?.dnsStatus?.[tool.id] || false;
            const isToolLoading = actionLoading === `enable:${tool.id}` || actionLoading === `disable:${tool.id}`;
            return (
              <div className="toggle-row" key={tool.id}>
                <div className="toggle-label">
                  <span className="icon">{tool.icon}</span>
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

      {/* Password Prompt */}
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
