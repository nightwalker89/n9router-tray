/**
 * Usage panel with period selector (Today, 24h, 7d, 60d).
 * Shows summary stats, active requests, recent log, and top models.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../api/client";
import { formatTokens, formatCost, formatTime, shortModel } from "../utils/format";
import { open } from "@tauri-apps/plugin-shell";

const PERIODS = [
  { value: "24h",  label: "24h" },
  { value: "7d",   label: "7d" },
  { value: "30d",  label: "30d" },
  { value: "60d",  label: "60d" },
];

function PeriodSelector({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, background: "var(--bg-tertiary)", borderRadius: 6, padding: 2 }}>
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          style={{
            flex: 1,
            padding: "4px 0",
            fontSize: 10,
            fontWeight: value === p.value ? 600 : 400,
            color: value === p.value ? "var(--text-primary)" : "var(--text-tertiary)",
            background: value === p.value ? "var(--bg-secondary)" : "transparent",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** Animated stat value */
function StatValue({ value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function UsagePanel() {
  const [period, setPeriod] = useState("24h");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const fetchStats = useCallback(async (p) => {
    try {
      const data = await api.getUsageStats(p);
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount and period change: fetch immediately + poll every 10s
  useEffect(() => {
    setLoading(true);
    fetchStats(period);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchStats(period), 10000);
    return () => clearInterval(pollRef.current);
  }, [period, fetchStats]);

  const openUsage = async () => {
    try { await open("http://localhost:20128/dashboard/usage"); }
    catch { window.open("http://localhost:20128/dashboard/usage", "_blank"); }
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
  const cachedTokens = stats?.totalCachedTokens || 0;
  const activeRequests = stats?.activeRequests || [];
  const recentRequests = (stats?.recentRequests || []).slice(0, 8);

  // Top models by request count
  const modelEntries = Object.entries(stats?.byModel || {})
    .map(([key, val]) => ({ name: key, ...val }))
    .sort((a, b) => (b.requests || 0) - (a.requests || 0))
    .slice(0, 5);
  const maxModelReq = modelEntries.length > 0 ? modelEntries[0].requests : 1;

  // Top providers by request count
  const providerEntries = Object.entries(stats?.byProvider || {})
    .map(([key, val]) => ({ name: key, ...val }))
    .sort((a, b) => (b.requests || 0) - (a.requests || 0))
    .slice(0, 4);

  const periodLabel = PERIODS.find(p => p.value === period)?.label || period;
  const hasData = stats?.totalRequests > 0 || activeRequests.length > 0;

  return (
    <div>
      {/* Period selector */}
      <div className="section" style={{ paddingBottom: 0 }}>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Summary Stats */}
      <div className="section">
        <div className="section-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{periodLabel} Summary</span>
          {loading && <span className="spinner" style={{ width: 12, height: 12 }} />}
        </div>
        <div className="stat-row">
          <StatValue value={stats?.totalRequests || 0} label="Requests" />
          <StatValue value={formatTokens(totalTokens)} label="Tokens" />
          <StatValue value={formatCost(stats?.totalCost || 0)} label="Cost" />
        </div>
        {/* Extra row: cached + prompt/completion split */}
        {totalTokens > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 9, color: "var(--text-tertiary)", justifyContent: "center" }}>
            <span>↗ {formatTokens(stats?.totalPromptTokens || 0)} prompt</span>
            <span>↙ {formatTokens(stats?.totalCompletionTokens || 0)} completion</span>
            {cachedTokens > 0 && <span>💾 {formatTokens(cachedTokens)} cached</span>}
          </div>
        )}
      </div>

      {/* Active Requests */}
      {activeRequests.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span className="dot pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
              Live Active ({activeRequests.length})
            </span>
          </div>
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
              const pct = Math.max(5, (model.requests / maxModelReq) * 100);
              return (
                <div key={model.name} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>
                      {shortModel(model.rawModel || model.name)}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)" }}>
                      <span>{model.requests} req</span>
                      {model.totalCost > 0 && <span>{formatCost(model.totalCost)}</span>}
                    </div>
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

      {/* Top Providers */}
      {providerEntries.length > 0 && (
        <div className="section">
          <div className="section-header">By Provider</div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {providerEntries.map(prov => (
              <div className="list-item" key={prov.name}>
                <div style={{
                  width: 22, height: 22, borderRadius: 5,
                  background: "var(--bg-tertiary)", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", flexShrink: 0,
                }}>
                  {prov.name[0].toUpperCase()}
                </div>
                <div className="item-content">
                  <div className="item-title" style={{ fontSize: 11 }}>
                    {prov.name.charAt(0).toUpperCase() + prov.name.slice(1)}
                  </div>
                  <div className="item-subtitle">
                    {prov.requests} req · {formatTokens((prov.promptTokens || 0) + (prov.completionTokens || 0))} tokens
                  </div>
                </div>
                {prov.totalCost > 0 && (
                  <div className="item-right" style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                    {formatCost(prov.totalCost)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Data State */}
      {!hasData && !loading && (
        <div style={{ textAlign: "center", padding: "30px 20px", color: "var(--text-tertiary)" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 12 }}>No usage data for {periodLabel}</div>
        </div>
      )}

      {/* Footer */}
      <button className="footer-link" onClick={openUsage}>
        View Full Report ↗
      </button>
    </div>
  );
}
