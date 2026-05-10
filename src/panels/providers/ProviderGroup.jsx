/**
 * Provider group — expandable card that wraps per-provider connection components.
 * Delegates to AntigravityConnection, CodexConnection, or DefaultConnection.
 */
import { useState } from "react";
import { ProviderIcon, Chevron } from "./shared";
import AntigravityConnection from "./AntigravityConnection";
import CodexConnection from "./CodexConnection";
import DefaultConnection from "./DefaultConnection";

function getConnectionComponent(provider) {
  switch (provider) {
    case "antigravity": return AntigravityConnection;
    case "codex":       return CodexConnection;
    default:            return DefaultConnection;
  }
}

export default function ProviderGroup({ node, quotas, healthData, onToggle, togglingId }) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = node.connections.filter(c => c.testStatus === "active").length;
  const total = node.connections.length;

  const ConnectionComponent = getConnectionComponent(node.provider);

  return (
    <div style={{ borderBottom: "1px solid var(--border-light)" }}>
      {/* Provider header */}
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
        <Chevron expanded={expanded} />
      </div>

      {/* Connections list */}
      {expanded && (
        <div className="provider-accounts" style={{ background: "rgba(0,0,0,0.08)" }}>
          {node.connections.map(conn => {
            // Health store keys by email (preferred) or connection ID (fallback)
            const healthEvents = healthData[conn.email] || healthData[conn.id] || null;
            return (
              <ConnectionComponent
                key={conn.id}
                conn={conn}
                quota={quotas[conn.id]}
                healthEvents={healthEvents}
                onToggle={onToggle}
                toggling={togglingId === conn.id}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
