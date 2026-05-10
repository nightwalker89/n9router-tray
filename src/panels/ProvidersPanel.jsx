import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { open } from "@tauri-apps/plugin-shell";

const PROVIDER_ICONS = {
  anthropic: "🟣",
  openai: "🟢",
  gemini: "🔵",
  google: "🔵",
  cursor: "📝",
  codex: "⚡",
  kiro: "🪁",
  copilot: "🤖",
  openrouter: "🌐",
  deepseek: "🐋",
  together: "🤝",
  groq: "⚡",
  mistral: "🔶",
  xai: "✖️",
  default: "🔸",
};

function getProviderIcon(provider) {
  const key = (provider || "").toLowerCase();
  return PROVIDER_ICONS[key] || PROVIDER_ICONS.default;
}

export default function ProvidersPanel() {
  const { data: providers, error: provError } = usePolling(api.getProviders, 30000);
  const { data: combos, error: comboError } = usePolling(api.getCombos, 30000);

  const openDashboard = async () => {
    try {
      await open("http://localhost:20128/dashboard/providers");
    } catch {
      window.open("http://localhost:20128/dashboard/providers", "_blank");
    }
  };

  if ((provError && !providers) || (comboError && !combos)) {
    return (
      <div className="offline-overlay">
        <div className="offline-icon">🔌</div>
        <div className="offline-title">Cannot Load Providers</div>
        <div className="offline-subtitle">n9router may not be running</div>
      </div>
    );
  }

  // Group connections by provider node
  const nodeMap = {};
  if (Array.isArray(providers)) {
    for (const conn of providers) {
      const nodeId = conn.providerNodeId || conn.provider || "unknown";
      if (!nodeMap[nodeId]) {
        nodeMap[nodeId] = {
          id: nodeId,
          name: conn.providerNodeName || conn.provider || nodeId,
          provider: conn.provider || nodeId,
          connections: [],
        };
      }
      nodeMap[nodeId].connections.push(conn);
    }
  }

  const nodes = Object.values(nodeMap);
  const comboList = Array.isArray(combos) ? combos : [];

  return (
    <div>
      {/* Combos */}
      {comboList.length > 0 && (
        <div className="section">
          <div className="section-header">Model Combos</div>
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
                <div className="item-right">
                  {(combo.models || []).length} models
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Providers */}
      <div className="section">
        <div className="section-header">
          Provider Connections ({providers?.length || 0})
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {nodes.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              No providers connected
            </div>
          ) : (
            nodes.map((node) => {
              const validCount = node.connections.filter((c) => c.valid !== false).length;
              const totalCount = node.connections.length;
              const allValid = validCount === totalCount;
              return (
                <div className="list-item" key={node.id}>
                  <div className="item-icon">{getProviderIcon(node.provider)}</div>
                  <div className="item-content">
                    <div className="item-title">{node.name}</div>
                    <div className="item-subtitle">
                      {totalCount} account{totalCount !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <span className={`badge ${allValid ? "green" : "yellow"}`}>
                    {allValid ? "✓" : `${validCount}/${totalCount}`}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <button className="footer-link" onClick={openDashboard}>
        Open Dashboard ↗
      </button>
    </div>
  );
}
