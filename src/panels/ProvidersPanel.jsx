import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { open } from "@tauri-apps/plugin-shell";

// Serve provider icons directly from n9router's public/providers/ folder
const N9_BASE = "http://localhost:20128";

// Map provider IDs/names to their icon filename in n9router/public/providers/
const PROVIDER_ICON_FILE = {
  anthropic:        "anthropic.png",
  openai:           "openai.png",
  gemini:           "gemini.png",
  "gemini-cli":     "gemini-cli.png",
  google:           "gemini.png",
  cursor:           "cursor.png",
  codex:            "codex.png",
  kiro:             "kiro.png",
  copilot:          "copilot.png",
  "github-copilot": "copilot.png",
  openrouter:       "openrouter.png",
  deepseek:         "deepseek.png",
  together:         "together.png",
  groq:             "groq.png",
  mistral:          "mistral.png",
  xai:              "xai.png",
  grok:             "xai.png",
  ollama:           "ollama.png",
  azure:            "azure.png",
  vertex:           "vertex.png",
  claude:           "claude.png",
  antigravity:      "antigravity.png",
  iflow:            "iflow.png",
  deepgram:         "deepgram.png",
  groqcloud:        "groq.png",
  fireworks:        "fireworks.png",
  perplexity:       "perplexity.png",
  cohere:           "cohere.png",
  huggingface:      "huggingface.png",
  cerebras:         "cerebras.png",
  hyperbolic:       "hyperbolic.png",
  nvidia:           "nvidia.png",
  qwen:             "qwen.png",
  minimax:          "minimax.png",
  kimi:             "kimi.png",
  glm:              "glm.png",
  blackbox:         "blackbox.png",
  roo:              "roo.png",
  cline:            "cline.png",
  continue:         "continue.png",
  droid:            "droid.png",
  openclaw:         "openclaw.png",
  hermes:           "hermes.png",
};

function getIconUrl(provider) {
  const key = (provider || "").toLowerCase().replace(/[_\s]/g, "-");
  const file = PROVIDER_ICON_FILE[key];
  if (file) return `${N9_BASE}/providers/${file}`;
  return null;
}

function ProviderIcon({ provider, name, size = 28 }) {
  const src = getIconUrl(provider);
  if (!src) {
    // Fallback: first letter avatar
    return (
      <div style={{
        width: size, height: size, borderRadius: Math.round(size * 0.22),
        background: "var(--bg-tertiary)", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: size * 0.45, fontWeight: 700,
        color: "var(--text-secondary)", flexShrink: 0,
      }}>
        {(name || provider || "?")[0].toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={provider}
      onError={(e) => { e.target.style.display = "none"; }}
      style={{
        borderRadius: Math.round(size * 0.22),
        objectFit: "contain",
        flexShrink: 0,
        display: "block",
        background: "var(--bg-secondary)",
      }}
    />
  );
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
                  <ProviderIcon provider={node.provider} name={node.name} size={28} />
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
