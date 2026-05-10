import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { open } from "@tauri-apps/plugin-shell";

const N9_BASE = "http://localhost:20128";

// ── Icon helpers ────────────────────────────────────────────────────────────

const PROVIDER_ICON_FILE = {
  antigravity: "antigravity.png", openai: "openai.png", gemini: "gemini.png",
  "gemini-cli": "gemini-cli.png", google: "gemini.png", cursor: "cursor.png",
  codex: "codex.png", kiro: "kiro.png", copilot: "copilot.png",
  openrouter: "openrouter.png", deepseek: "deepseek.png", together: "together.png",
  groq: "groq.png", mistral: "mistral.png", xai: "xai.png", grok: "xai.png",
  ollama: "ollama.png", azure: "azure.png", vertex: "vertex.png",
  claude: "claude.png", anthropic: "anthropic.png", iflow: "iflow.png",
  fireworks: "fireworks.png", perplexity: "perplexity.png",
  cohere: "cohere.png", huggingface: "huggingface.png",
  cerebras: "cerebras.png", nvidia: "nvidia.png", qwen: "qwen.png",
  blackbox: "blackbox.png", roo: "roo.png", cline: "cline.png",
  droid: "droid.png", openclaw: "openclaw.png", hermes: "hermes.png",
};

function getIconUrl(provider) {
  const key = (provider || "").toLowerCase().replace(/[_\s]/g, "-");
  return PROVIDER_ICON_FILE[key] ? `${N9_BASE}/providers/${PROVIDER_ICON_FILE[key]}` : null;
}

function ProviderIcon({ provider, name, size = 26 }) {
  const src = getIconUrl(provider);
  const r = Math.round(size * 0.22);
  if (!src) return (
    <div style={{ width: size, height: size, borderRadius: r, background: "var(--bg-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.45, fontWeight: 700, color: "var(--text-secondary)", flexShrink: 0 }}>
      {(name || provider || "?")[0].toUpperCase()}
    </div>
  );
  return <img src={src} width={size} height={size} alt={provider} onError={e => { e.currentTarget.style.display = "none"; }} style={{ borderRadius: r, objectFit: "contain", flexShrink: 0, display: "block", background: "var(--bg-secondary)" }} />;
}

// ── Quota helpers ───────────────────────────────────────────────────────────

function getBarColor(pct) {
  if (pct > 70) return "var(--green)";
  if (pct >= 30) return "var(--yellow)";
  return "var(--red)";
}

function formatResetTime(date) {
  if (!date) return null;
  try {
    const diff = new Date(date) - new Date();
    if (diff <= 0) return null;
    const m = Math.ceil(diff / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  } catch { return null; }
}

/**
 * Normalize any provider's quota response into a simple array
 * { name, pct, resetAt, used?, total? }
 */
function normalizeQuotas(provider, data) {
  if (!data?.quotas) return [];
  const entries = Object.entries(data.quotas);

  return entries.map(([key, q]) => {
    const pct = q.remainingPercentage != null
      ? Math.round(q.remainingPercentage)
      : q.total > 0 ? Math.round(((q.total - (q.used || 0)) / q.total) * 100) : null;

    return {
      key,
      name: q.displayName || key,
      pct,
      used: q.used ?? 0,
      total: q.total ?? 0,
      remaining: q.remaining ?? (q.total ? q.total - (q.used || 0) : null),
      resetAt: q.resetAt || null,
      exhausted: q.exhausted || false,
      unlimited: q.unlimited || false,
    };
  });
}

/**
 * For Antigravity: show only claude-sonnet-4-6 like the Token Swap card does
 */
const AG_HIGHLIGHT_MODEL = "claude-sonnet-4-6";

function getAgHighlightQuota(quotas) {
  return quotas.find(q => q.key === AG_HIGHLIGHT_MODEL || q.key?.includes("sonnet")) || quotas[0];
}

// ── Health dots ─────────────────────────────────────────────────────────────

function getHealthDotColor(status) {
  if (status === "success") return "#22c55e";
  if (status === "fail") return "#ef4444";
  return "#fb923c"; // retry_success
}

function HealthDots({ events }) {
  if (!events || events.length === 0) return null;
  const ok = events.filter(e => e.status === "success").length;
  const fail = events.filter(e => e.status === "fail").length;
  const retry = events.filter(e => e.status === "retry_success").length;

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        {events.map((ev, i) => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: 1,
            background: getHealthDotColor(ev.status),
            opacity: 0.7,
          }} title={`${new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} — ${ev.status}${ev.model ? ` (${ev.model})` : ""}`} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 3, fontSize: 9, color: "var(--text-tertiary)" }}>
        <span>{events.length} calls</span>
        {ok > 0 && <span style={{ color: "var(--green)" }}>{ok} ok</span>}
        {retry > 0 && <span style={{ color: "var(--yellow)" }}>{retry} retry</span>}
        {fail > 0 && <span style={{ color: "var(--red)" }}>{fail} fail</span>}
      </div>
    </div>
  );
}

// ── Quota bar ───────────────────────────────────────────────────────────────

function QuotaBar({ q }) {
  const color = getBarColor(q.pct ?? 0);
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
        <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{q.name}</span>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 6 }}>
          {q.total > 0 && <span style={{ color: "var(--text-tertiary)" }}>{q.used}/{q.total}</span>}
          <span style={{ color, fontWeight: 600 }}>{q.pct != null ? `${q.pct}%` : "—"}</span>
        </div>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${q.pct ?? 0}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

/** Compact single-line quota summary for collapsed view */
function QuotaSummaryInline({ q }) {
  if (!q || q.pct == null) return null;
  const color = getBarColor(q.pct);
  const reset = formatResetTime(q.resetAt);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "var(--text-tertiary)" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>{q.name}</span>
      <div style={{ flex: 1, minWidth: 30, maxWidth: 50, height: 3, borderRadius: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${q.pct}%`, background: color, borderRadius: 2 }} />
      </div>
      <span style={{ color, fontWeight: 600 }}>{q.pct}%</span>
      {reset && <span>· {reset}</span>}
    </div>
  );
}

// ── Account row ─────────────────────────────────────────────────────────────

function AccountRow({ conn, provider, quota, healthEvents, onToggle, toggling }) {
  const [expanded, setExpanded] = useState(false);
  const active = conn.testStatus === "active";
  const isAntigravity = provider === "antigravity";

  // Determine what quota to show inline (collapsed)
  const allQuotas = quota?.quotas || [];
  let inlineQuota = null;
  if (isAntigravity && allQuotas.length > 0) {
    inlineQuota = getAgHighlightQuota(allQuotas);
  } else if (allQuotas.length > 0) {
    // For non-antigravity: show the first quota inline
    inlineQuota = allQuotas[0];
  }

  // For antigravity expanded: show only sonnet. For others: show all.
  const expandedQuotas = isAntigravity
    ? allQuotas.filter(q => q.key === AG_HIGHLIGHT_MODEL || q.key?.includes("sonnet"))
    : allQuotas;

  const hasExpandableContent = expandedQuotas.length > 0 || (isAntigravity && healthEvents?.length > 0);

  return (
    <div style={{ borderBottom: "1px solid var(--border-light)" }}>
      {/* Header */}
      <div
        className="provider-account-row"
        onClick={() => hasExpandableContent && setExpanded(e => !e)}
        style={{ cursor: hasExpandableContent ? "pointer" : "default" }}
      >
        {/* Status dot */}
        <div style={{
          width: 7, height: 7, borderRadius: 4,
          background: active ? "var(--green)" : conn.testStatus === "unavailable" ? "var(--red)" : "var(--text-tertiary)",
          flexShrink: 0, boxShadow: active ? "0 0 4px rgba(48,209,88,0.4)" : "none",
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {conn.name || conn.email || conn.id.slice(0, 8)}
            </span>
            {conn.accountType && conn.accountType !== "-" && (
              <span style={{
                fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
                background: conn.accountType === "Ultra" ? "rgba(255,214,10,0.15)" : conn.accountType === "Pro" ? "rgba(66,133,244,0.15)" : "var(--bg-tertiary)",
                color: conn.accountType === "Ultra" ? "var(--yellow)" : conn.accountType === "Pro" ? "#4285F4" : "var(--text-tertiary)",
                border: `1px solid ${conn.accountType === "Ultra" ? "rgba(255,214,10,0.3)" : conn.accountType === "Pro" ? "rgba(66,133,244,0.3)" : "var(--border-light)"}`,
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>
                {conn.accountType}
              </span>
            )}
          </div>
          {/* Sub-info line */}
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1, display: "flex", gap: 6 }}>
            {conn.email && <span>{conn.email}</span>}
            {!conn.email && <span>{conn.authType}</span>}
          </div>
          {/* Inline quota summary */}
          {!expanded && inlineQuota && <QuotaSummaryInline q={inlineQuota} />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            className={`toggle-switch ${conn.isActive ? "on" : ""} ${toggling ? "loading" : ""}`}
            style={{ transform: "scale(0.7)", transformOrigin: "right center" }}
            onClick={(e) => { e.stopPropagation(); onToggle(conn.id, !conn.isActive); }}
            disabled={toggling}
          />
          {hasExpandableContent && (
            <span style={{ fontSize: 8, color: "var(--text-tertiary)", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none", display: "inline-block" }}>▼</span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="provider-accounts" style={{ padding: "6px 12px 10px 26px", background: "rgba(0,0,0,0.15)" }}>
          {/* Quota detail */}
          {expandedQuotas.length > 0 && (
            <div style={{ marginBottom: isAntigravity && healthEvents?.length ? 6 : 0 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.05em", marginBottom: 4, textTransform: "uppercase" }}>
                {isAntigravity ? "Sonnet 4.6 Quota" : "Quota"}
              </div>
              {expandedQuotas.map(q => <QuotaBar key={q.key} q={q} />)}
              {expandedQuotas[0]?.resetAt && (() => {
                const r = formatResetTime(expandedQuotas[0].resetAt);
                return r ? <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>Reset in {r}</div> : null;
              })()}
            </div>
          )}

          {/* Health dots — Antigravity only */}
          {isAntigravity && healthEvents?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.05em", marginBottom: 3, textTransform: "uppercase" }}>Health</div>
              <HealthDots events={healthEvents} />
            </div>
          )}

          {/* Token expiry */}
          {conn.expiresAt && (
            <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 4 }}>
              Token expires: {new Date(conn.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Provider group ──────────────────────────────────────────────────────────

function ProviderGroup({ node, quotas, healthData, onToggle, togglingId }) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = node.connections.filter(c => c.testStatus === "active").length;
  const total = node.connections.length;

  return (
    <div style={{ borderBottom: "1px solid var(--border-light)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
        <ProviderIcon provider={node.provider} name={node.name} size={26} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{node.name}</div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 1 }}>
            {total} account{total !== 1 ? "s" : ""} · {activeCount} active
          </div>
        </div>
        <span className={`badge ${activeCount === total ? "green" : activeCount > 0 ? "yellow" : "red"}`}>
          {activeCount === total ? `✓ ${total}` : activeCount === 0 ? `✗ ${total}` : `${activeCount}/${total}`}
        </span>
        <span style={{ fontSize: 8, color: "var(--text-tertiary)", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none", display: "inline-block" }}>▼</span>
      </div>

      {expanded && (
        <div className="provider-accounts" style={{ background: "rgba(0,0,0,0.08)" }}>
          {node.connections.map(conn => (
            <AccountRow
              key={conn.id}
              conn={conn}
              provider={node.provider}
              quota={quotas[conn.id]}
              healthEvents={healthData[conn.id]}
              onToggle={onToggle}
              toggling={togglingId === conn.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────

export default function ProvidersPanel() {
  const { data: providers, loading, error, refetch } = usePolling(api.getProviders, 15000);
  const { data: combos } = usePolling(api.getCombos, 30000);
  const [togglingId, setTogglingId] = useState(null);
  const [localOverrides, setLocalOverrides] = useState({});
  const [quotas, setQuotas] = useState({});     // { [connId]: { quotas: [...], plan?, error? } }
  const [healthData, setHealthData] = useState({}); // { [connId]: HealthEvent[] }
  const quotaFetched = useRef(new Set());

  // Fetch health data for antigravity accounts
  useEffect(() => {
    api.getAccountHealth().then(setHealthData).catch(() => {});
    const id = setInterval(() => { api.getAccountHealth().then(setHealthData).catch(() => {}); }, 15000);
    return () => clearInterval(id);
  }, []);

  // Fetch quotas for each connection once (on first load or on provider list change)
  useEffect(() => {
    if (!Array.isArray(providers)) return;
    for (const conn of providers) {
      if (conn.testStatus !== "active" || quotaFetched.current.has(conn.id)) continue;
      quotaFetched.current.add(conn.id);
      api.getAccountQuota(conn.id)
        .then(data => {
          const normalized = normalizeQuotas(conn.provider, data);
          setQuotas(prev => ({ ...prev, [conn.id]: { quotas: normalized, plan: data.plan, raw: data } }));
        })
        .catch(() => {
          setQuotas(prev => ({ ...prev, [conn.id]: { quotas: [], error: true } }));
        });
    }
  }, [providers]);

  const openDashboard = async () => {
    try { await open("http://localhost:20128/dashboard/providers"); } catch { window.open("http://localhost:20128/dashboard/providers", "_blank"); }
  };

  const handleToggle = useCallback(async (id, newIsActive) => {
    setLocalOverrides(o => ({ ...o, [id]: newIsActive }));
    setTogglingId(id);
    try {
      await api.toggleConnection(id, newIsActive);
      await refetch();
    } catch {
      setLocalOverrides(o => { const n = { ...o }; delete n[id]; return n; });
    } finally {
      setTogglingId(null);
    }
  }, [refetch]);

  if (error && !providers) {
    return (
      <div className="offline-overlay">
        <div className="offline-icon">🔌</div>
        <div className="offline-title">Cannot Load Providers</div>
        <button className="retry-button" onClick={refetch}>Retry</button>
      </div>
    );
  }

  const merged = (providers || []).map(c => localOverrides[c.id] !== undefined ? { ...c, isActive: localOverrides[c.id] } : c);
  const nodeMap = {};
  for (const conn of merged) {
    const key = conn.provider || "unknown";
    if (!nodeMap[key]) nodeMap[key] = { provider: key, name: key.charAt(0).toUpperCase() + key.slice(1), connections: [] };
    nodeMap[key].connections.push(conn);
  }
  const nodes = Object.values(nodeMap).sort((a, b) => {
    const aA = a.connections.filter(c => c.testStatus === "active").length;
    const bA = b.connections.filter(c => c.testStatus === "active").length;
    return bA !== aA ? bA - aA : a.name.localeCompare(b.name);
  });
  const comboList = Array.isArray(combos) ? combos : [];

  return (
    <div>
      {comboList.length > 0 && (
        <div className="section">
          <div className="section-header">Model Combos ({comboList.length})</div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {comboList.map(c => (
              <div className="list-item" key={c.id || c.name}>
                <div className="item-icon">🎯</div>
                <div className="item-content">
                  <div className="item-title">{c.name}</div>
                  <div className="item-subtitle">{(c.models || []).slice(0, 3).map(m => m.model || m).join(" → ")}{(c.models || []).length > 3 && ` +${c.models.length - 3}`}</div>
                </div>
                <div className="item-right">{(c.models || []).length} models</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          Providers
          <span style={{ marginLeft: 4, color: "var(--text-tertiary)", fontWeight: 400 }}>
            ({merged.length} accounts · {nodes.length} providers)
          </span>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {loading && nodes.length === 0 ? (
            <div style={{ padding: 16, display: "flex", justifyContent: "center" }}><span className="spinner" /></div>
          ) : nodes.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>No providers connected</div>
          ) : (
            nodes.map(n => (
              <ProviderGroup
                key={n.provider}
                node={n}
                quotas={quotas}
                healthData={healthData}
                onToggle={handleToggle}
                togglingId={togglingId}
              />
            ))
          )}
        </div>
      </div>

      <button className="footer-link" onClick={openDashboard}>Open Dashboard ↗</button>
    </div>
  );
}
