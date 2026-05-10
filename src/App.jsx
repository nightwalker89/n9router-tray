import { useState, useEffect } from "react";
import { api } from "./api/client";
import { usePolling } from "./hooks/usePolling";
import MitmPanel from "./panels/MitmPanel";
import ProvidersPanel from "./panels/ProvidersPanel";
import UsagePanel from "./panels/UsagePanel";

const TABS = [
  { id: "mitm", label: "MITM", icon: "🛡️" },
  { id: "providers", label: "Providers", icon: "🔌" },
  { id: "usage", label: "Usage", icon: "📊" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("mitm");
  const [serverOnline, setServerOnline] = useState(null); // null = checking

  // Health check — every 10s
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        await api.health();
        if (active) setServerOnline(true);
      } catch {
        if (active) setServerOnline(false);
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Server offline overlay
  if (serverOnline === false) {
    return (
      <div className="app-container">
        <div className="tab-bar">
          <span className="tab-bar-title">n9 Control</span>
        </div>
        <div className="offline-overlay">
          <div className="offline-icon">📡</div>
          <div className="offline-title">n9router Not Running</div>
          <div className="offline-subtitle">
            Start n9router on port 20128 to use the control panel
          </div>
          <button
            className="retry-button"
            onClick={async () => {
              try {
                await api.health();
                setServerOnline(true);
              } catch {
                setServerOnline(false);
              }
            }}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (serverOnline === null) {
    return (
      <div className="app-container">
        <div className="tab-bar">
          <span className="tab-bar-title">n9 Control</span>
        </div>
        <div className="offline-overlay">
          <div className="spinner" style={{ width: 24, height: 24 }} />
          <div className="offline-subtitle">Connecting to n9router...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Tab Bar */}
      <div className="tab-bar">
        <span className="tab-bar-title">n9</span>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel Content */}
      <div className="panel-content" key={activeTab}>
        {activeTab === "mitm" && <MitmPanel />}
        {activeTab === "providers" && <ProvidersPanel />}
        {activeTab === "usage" && <UsagePanel />}
      </div>
    </div>
  );
}
