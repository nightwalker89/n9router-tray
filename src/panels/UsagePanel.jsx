import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { formatTokens, formatCost, formatTime, shortModel } from "../utils/format";
import { open } from "@tauri-apps/plugin-shell";

export default function UsagePanel() {
  const { data: stats, error } = usePolling(() => api.getUsageStats("24h"), 10000);

  const openUsage = async () => {
    try {
      await open("http://localhost:20128/dashboard/usage");
    } catch {
      window.open("http://localhost:20128/dashboard/usage", "_blank");
    }
  };

  if (error && !stats) {
    return (
      <div className="offline-overlay">
        <div className="offline-icon">📊</div>
        <div className="offline-title">Cannot Load Usage</div>
        <div className="offline-subtitle">n9router may not be running</div>
      </div>
    );
  }

  const totalTokens = (stats?.totalPromptTokens || 0) + (stats?.totalCompletionTokens || 0);
  const activeRequests = stats?.activeRequests || [];
  const recentRequests = (stats?.recentRequests || []).slice(0, 6);

  // Top models by requests
  const modelEntries = Object.entries(stats?.byModel || {})
    .map(([key, val]) => ({ name: key, ...val }))
    .sort((a, b) => (b.requests || 0) - (a.requests || 0))
    .slice(0, 4);

  const maxModelRequests = modelEntries.length > 0 ? modelEntries[0].requests : 1;

  return (
    <div>
      {/* Summary Stats */}
      <div className="section">
        <div className="section-header">Today</div>
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-value">{stats?.totalRequests || 0}</div>
            <div className="stat-label">Requests</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatTokens(totalTokens)}</div>
            <div className="stat-label">Tokens</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatCost(stats?.totalCost || 0)}</div>
            <div className="stat-label">Cost</div>
          </div>
        </div>
      </div>

      {/* Active Requests */}
      {activeRequests.length > 0 && (
        <div className="section">
          <div className="section-header">Live Active</div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {activeRequests.map((req, i) => (
              <div className="list-item" key={i}>
                <div className="item-icon" style={{ background: "var(--green-dim)" }}>
                  <span className="dot pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />
                </div>
                <div className="item-content">
                  <div className="item-title">{shortModel(req.model)}</div>
                  <div className="item-subtitle">{req.provider} • {req.account}</div>
                </div>
                <div className="item-right" style={{ fontWeight: 600 }}>×{req.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Requests */}
      {recentRequests.length > 0 && (
        <div className="section">
          <div className="section-header">Recent</div>
          <div className="card" style={{ padding: "4px 0", overflow: "hidden" }}>
            {recentRequests.map((req, i) => (
              <div className="log-entry" key={i}>
                <span className="log-time">{formatTime(req.timestamp)}</span>
                <span className="log-model">{shortModel(req.model)}</span>
                <span className="log-tokens">
                  {formatTokens(req.promptTokens)}→{formatTokens(req.completionTokens)}
                </span>
                <span className="log-status">
                  {req.status === "ok" || req.status === "success" ? "✅" : "❌"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Models */}
      {modelEntries.length > 0 && (
        <div className="section">
          <div className="section-header">Top Models</div>
          <div className="card" style={{ padding: "8px 12px", overflow: "hidden" }}>
            {modelEntries.map((model) => {
              const pct = Math.max(5, (model.requests / maxModelRequests) * 100);
              return (
                <div key={model.name} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                      {shortModel(model.rawModel || model.name)}
                    </span>
                    <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>
                      {model.requests} req
                    </span>
                  </div>
                  <div style={{ height: 4, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: 2, transition: "width 0.3s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No Data State */}
      {!stats?.totalRequests && activeRequests.length === 0 && (
        <div style={{ textAlign: "center", padding: "30px 20px", color: "var(--text-tertiary)" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 12 }}>No usage data today</div>
        </div>
      )}

      {/* Footer */}
      <button className="footer-link" onClick={openUsage}>
        View Full Report ↗
      </button>
    </div>
  );
}
