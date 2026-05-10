/**
 * Providers panel — data layer + layout.
 * Delegates rendering to ProviderGroup → per-provider Connection components.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { open } from "@tauri-apps/plugin-shell";
import { normalizeQuotas } from "./providers/shared";
import ProviderGroup from "./providers/ProviderGroup";

export default function ProvidersPanel() {
  const { data: providers, loading, error, refetch } = usePolling(api.getProviders, 15000);
  const { data: combos } = usePolling(api.getCombos, 30000);
  const [togglingId, setTogglingId] = useState(null);
  const [localOverrides, setLocalOverrides] = useState({});
  const [quotas, setQuotas] = useState({});
  const [healthData, setHealthData] = useState({});
  const quotaFetched = useRef(new Set());

  // Poll account health (for antigravity health dots)
  useEffect(() => {
    const fetch = () => api.getAccountHealth().then(setHealthData).catch(() => {});
    fetch();
    const id = setInterval(fetch, 15000);
    return () => clearInterval(id);
  }, []);

  // Fetch quota per active connection (once per session)
  useEffect(() => {
    if (!Array.isArray(providers)) return;
    for (const conn of providers) {
      if (conn.testStatus !== "active" || quotaFetched.current.has(conn.id)) continue;
      quotaFetched.current.add(conn.id);
      api.getAccountQuota(conn.id)
        .then(data => {
          const normalized = normalizeQuotas(data);
          setQuotas(prev => ({ ...prev, [conn.id]: { quotas: normalized, plan: data.plan, raw: data } }));
        })
        .catch(() => {
          setQuotas(prev => ({ ...prev, [conn.id]: { quotas: [], error: true } }));
        });
    }
  }, [providers]);

  const openDashboard = async () => {
    try { await open("http://localhost:20128/dashboard/providers"); }
    catch { window.open("http://localhost:20128/dashboard/providers", "_blank"); }
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

  // Merge optimistic isActive overrides
  const merged = (providers || []).map(c =>
    localOverrides[c.id] !== undefined ? { ...c, isActive: localOverrides[c.id] } : c
  );

  // Group by provider slug
  const nodeMap = {};
  for (const conn of merged) {
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
    const aA = a.connections.filter(c => c.testStatus === "active").length;
    const bA = b.connections.filter(c => c.testStatus === "active").length;
    return bA !== aA ? bA - aA : a.name.localeCompare(b.name);
  });

  const comboList = Array.isArray(combos) ? combos : [];

  return (
    <div>
      {/* Model Combos */}
      {comboList.length > 0 && (
        <div className="section">
          <div className="section-header">Model Combos ({comboList.length})</div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {comboList.map(c => (
              <div className="list-item" key={c.id || c.name}>
                <div className="item-icon">🎯</div>
                <div className="item-content">
                  <div className="item-title">{c.name}</div>
                  <div className="item-subtitle">
                    {(c.models || []).slice(0, 3).map(m => m.model || m).join(" → ")}
                    {(c.models || []).length > 3 && ` +${c.models.length - 3}`}
                  </div>
                </div>
                <div className="item-right">{(c.models || []).length} models</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Provider Groups */}
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
