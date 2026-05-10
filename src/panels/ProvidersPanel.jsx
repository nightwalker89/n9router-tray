import { useState, useCallback } from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { open } from "@tauri-apps/plugin-shell";

const N9_BASE = "http://localhost:20128";

const PROVIDER_ICON_FILE = {
  antigravity: "antigravity.png", openai: "openai.png", gemini: "gemini.png",
  "gemini-cli": "gemini-cli.png", google: "gemini.png", cursor: "cursor.png",
  codex: "codex.png", kiro: "kiro.png", copilot: "copilot.png",
  "github-copilot": "copilot.png", openrouter: "openrouter.png",
  deepseek: "deepseek.png", together: "together.png", groq: "groq.png",
  mistral: "mistral.png", xai: "xai.png", grok: "xai.png",
  ollama: "ollama.png", azure: "azure.png", vertex: "vertex.png",
  claude: "claude.png", anthropic: "anthropic.png", iflow: "iflow.png",
  fireworks: "fireworks.png", perplexity: "perplexity.png",
  cohere: "cohere.png", huggingface: "huggingface.png",
  cerebras: "cerebras.png", hyperbolic: "hyperbolic.png", nvidia: "nvidia.png",
  qwen: "qwen.png", minimax: "minimax.png", kimi: "kimi.png",
  blackbox: "blackbox.png", roo: "roo.png", cline: "cline.png",
  droid: "droid.png", openclaw: "openclaw.png", hermes: "hermes.png",
};

function getIconUrl(provider) {
  const key = (provider || "").toLowerCase().replace(/[_\s]/g, "-");
  const file = PROVIDER_ICON_FILE[key];
  return file ? `${N9_BASE}/providers/${file}` : null;
}

function ProviderIcon({ provider, name, size = 26 }) {
  const src = getIconUrl(provider);
  const radius = Math.round(size * 0.22);
  if (!src) {
    return (
      <div style={{
        width: size, height: size, borderRadius: radius,
        background: "var(--bg-tertiary)", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: size * 0.45, fontWeight: 700,
        color: "var(--text-secondary)", flexShrink: 0,
      }}>
        {(name || provider || "?")[0].toUpperCase()}
      </div>
    );
  }
  return (
    <img src={src} width={size} height={size} alt={provider}
      onError={(e) => { e.currentTarget.style.display = "none"; }}
      style={{ borderRadius: radius, objectFit: "contain", flexShrink: 0, display: "block", background: "var(--bg-secondary)" }}
    />
  );
}

function isActive(status) { return status === "active"; }

// Quota bar for a single model
function QuotaBar({ quota }) {
  const pct = quota.remainingPercentage ?? 100;
  const color = quota.exhausted ? "var(--red)" : pct < 20 ? "var(--yellow)" : "var(--green)";
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>
        <span>{quota.displayName}</span>
        <span style={{ color }}>{quota.exhausted ? "Exhausted" : `${pct}%`}</span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

// Single account row inside an expanded provider
function AccountRow({ conn, onToggle, toggling }) {
  const [expanded, setExpanded] = useState(false);
  const active = isActive(conn.testStatus);
  const hasQuota = conn.modelQuotaStatus && Object.keys(conn.modelQuotaStatus).length > 0;
  const quotas = hasQuota ? Object.values(conn.modelQuotaStatus) : [];

  return (
    <div style={{ borderBottom: "1px solid var(--border-light)" }}>
      {/* Account header row */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: hasQuota ? "pointer" : "default" }}
        onClick={() => hasQuota && setExpanded(e => !e)}
      >
        {/* Avatar initials */}
        <div style={{
          width: 22, height: 22, borderRadius: 11,
          background: active ? "rgba(48,209,88,0.15)" : "var(--bg-tertiary)",
          border: `1px solid ${active ? "rgba(48,209,88,0.3)" : "var(--border-light)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 700, color: active ? "var(--green)" : "var(--text-tertiary)",
          flexShrink: 0,
        }}>
          {(conn.name || "?")[0].toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {conn.name || conn.email || conn.id.slice(0, 8)}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1 }}>
            {conn.email ? conn.email : conn.authType}
            {conn.accountType ? ` · ${conn.accountType}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Status dot */}
          <div style={{
            width: 6, height: 6, borderRadius: 3,
            background: active ? "var(--green)" : conn.testStatus === "unavailable" ? "var(--red)" : "var(--text-tertiary)",
            flexShrink: 0,
          }} />

          {/* isActive toggle */}
          <button
            className={`toggle-switch ${conn.isActive ? "on" : ""} ${toggling ? "loading" : ""}`}
            style={{ transform: "scale(0.75)", transformOrigin: "right center" }}
            onClick={(e) => { e.stopPropagation(); onToggle(conn.id, !conn.isActive); }}
            disabled={toggling}
          />

          {/* Expand chevron */}
          {hasQuota && (
            <span style={{ fontSize: 9, color: "var(--text-tertiary)", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none", display: "inline-block" }}>
              ▼
            </span>
          )}
        </div>
      </div>

      {/* Quota detail panel */}
      {expanded && hasQuota && (
        <div style={{ padding: "6px 12px 10px", background: "rgba(0,0,0,0.15)" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.05em", marginBottom: 6, textTransform: "uppercase" }}>
            Model Quota
          </div>
          {quotas.map((q, i) => <QuotaBar key={i} quota={q} />)}
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

// Provider group row with expandable accounts
function ProviderGroup({ node, onToggle, togglingId }) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = node.connections.filter(c => isActive(c.testStatus)).length;
  const total = node.connections.length;
  const allActive = activeCount === total;

  return (
    <div style={{ borderBottom: "1px solid var(--border-light)" }}>
      {/* Provider header */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}
      >
        <ProviderIcon provider={node.provider} name={node.name} size={26} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{node.name}</div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 1 }}>
            {total} account{total !== 1 ? "s" : ""}
            {activeCount < total ? ` · ${activeCount} active` : " · all active"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={`badge ${allActive ? "green" : activeCount > 0 ? "yellow" : "red"}`}>
            {allActive ? `✓ ${total}` : activeCount === 0 ? `✗ ${total}` : `${activeCount}/${total}`}
          </span>
          <span style={{
            fontSize: 9, color: "var(--text-tertiary)", transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "none", display: "inline-block",
          }}>▼</span>
        </div>
      </div>

      {/* Accounts list */}
      {expanded && (
        <div style={{ background: "rgba(0,0,0,0.1)" }}>
          {node.connections.map(conn => (
            <AccountRow
              key={conn.id}
              conn={conn}
              onToggle={onToggle}
              toggling={togglingId === conn.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProvidersPanel() {
  const { data: providers, loading, error, refetch } = usePolling(api.getProviders, 15000);
  const { data: combos } = usePolling(api.getCombos, 30000);
  const [togglingId, setTogglingId] = useState(null);
  const [localOverrides, setLocalOverrides] = useState({}); // id → isActive

  const openDashboard = async () => {
    try { await open("http://localhost:20128/dashboard/providers"); }
    catch { window.open("http://localhost:20128/dashboard/providers", "_blank"); }
  };

  const handleToggle = useCallback(async (id, newIsActive) => {
    // Optimistic update
    setLocalOverrides(o => ({ ...o, [id]: newIsActive }));
    setTogglingId(id);
    try {
      await api.toggleConnection(id, newIsActive);
      await refetch();
    } catch {
      // Revert on failure
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

  // Merge optimistic overrides
  const mergedProviders = (providers || []).map(c =>
    localOverrides[c.id] !== undefined ? { ...c, isActive: localOverrides[c.id] } : c
  );

  // Group by provider
  const nodeMap = {};
  for (const conn of mergedProviders) {
    const key = conn.provider || "unknown";
    if (!nodeMap[key]) {
      nodeMap[key] = {
        provider: key,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        connections: [],
      };
    }
    nodeMap[key].connections.push(conn);
  }

  const nodes = Object.values(nodeMap).sort((a, b) => {
    const aA = a.connections.filter(c => isActive(c.testStatus)).length;
    const bA = b.connections.filter(c => isActive(c.testStatus)).length;
    return bA !== aA ? bA - aA : a.name.localeCompare(b.name);
  });

  const comboList = Array.isArray(combos) ? combos : [];
  const totalConns = providers?.length ?? 0;

  return (
    <div>
      {/* Combos */}
      {comboList.length > 0 && (
        <div className="section">
          <div className="section-header">Model Combos ({comboList.length})</div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {comboList.map((combo) => (
              <div className="list-item" key={combo.id || combo.name}>
                <div className="item-icon">🎯</div>
                <div className="item-content">
                  <div className="item-title">{combo.name}</div>
                  <div className="item-subtitle">
                    {(combo.models || []).slice(0, 3).map((m) => m.model || m).join(" → ")}
                    {(combo.models || []).length > 3 && ` +${combo.models.length - 3}`}
                  </div>
                </div>
                <div className="item-right">{(combo.models || []).length} models</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Providers */}
      <div className="section">
        <div className="section-header">
          Providers
          <span style={{ marginLeft: 4, color: "var(--text-tertiary)", fontWeight: 400 }}>
            ({totalConns} accounts · {nodes.length} providers)
          </span>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {loading && nodes.length === 0 ? (
            <div style={{ padding: 16, display: "flex", justifyContent: "center" }}>
              <span className="spinner" />
            </div>
          ) : nodes.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              No providers connected
            </div>
          ) : (
            nodes.map(node => (
              <ProviderGroup
                key={node.provider}
                node={node}
                onToggle={handleToggle}
                togglingId={togglingId}
              />
            ))
          )}
        </div>
      </div>

      <button className="footer-link" onClick={openDashboard}>
        Open Dashboard ↗
      </button>
    </div>
  );
}
