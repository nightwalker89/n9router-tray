/**
 * SettingsPanel — Tray settings + full n9router profile settings.
 *
 * Section A: Tray-specific settings (persisted via tauri-plugin-store)
 * Section B: n9router settings (all from /api/settings, PATCH on change)
 */
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { api } from "../api/client";

// ── Shared toggle component ───────────────────────────────────────────────────
function SettingToggle({ checked, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: checked ? "var(--accent)" : "var(--bg-tertiary)",
        border: "none", cursor: disabled ? "not-allowed" : "pointer",
        position: "relative", flexShrink: 0, transition: "background 0.2s",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: "absolute", top: 2,
        left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: "50%",
        background: "#fff", transition: "left 0.15s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}

// ── Setting row ───────────────────────────────────────────────────────────────
function SettingRow({ label, description, children, topBorder }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 10, padding: "8px 0",
      borderTop: topBorder ? "1px solid var(--border-light)" : undefined,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)" }}>{label}</div>
        {description && (
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1, lineHeight: 1.4 }}>
            {description}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon, title }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "10px 12px 6px",
      borderBottom: "1px solid var(--border-light)",
    }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--text-tertiary)" }}>
        {title}
      </span>
    </div>
  );
}

// ── Compact text / number input ───────────────────────────────────────────────
function CompactInput({ value, onChange, type = "text", min, max, placeholder, disabled }) {
  return (
    <input
      type={type}
      value={value}
      min={min}
      max={max}
      placeholder={placeholder}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      style={{
        width: type === "number" ? 52 : 140,
        fontSize: 11, padding: "3px 6px",
        background: "var(--bg-tertiary)", border: "1px solid var(--border-light)",
        borderRadius: 5, color: "var(--text-primary)", textAlign: type === "number" ? "center" : "left",
        outline: "none", flexShrink: 0,
      }}
    />
  );
}

// ── Status feedback toast ─────────────────────────────────────────────────────
function StatusNote({ msg, isError }) {
  if (!msg) return null;
  return (
    <div style={{
      fontSize: 9, padding: "3px 8px", borderRadius: 4, marginTop: 4,
      background: isError ? "rgba(255,69,58,0.12)" : "rgba(52,199,89,0.12)",
      color: isError ? "var(--red)" : "#34c759",
      border: `1px solid ${isError ? "rgba(255,69,58,0.25)" : "rgba(52,199,89,0.25)"}`,
    }}>
      {msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPanel() {
  // ── Tray store state ──
  const [autoStart, setAutoStart]   = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [killPort, setKillPort]     = useState(false);
  const [verboseLog, setVerboseLog] = useState(false);
  const [storeReady, setStoreReady] = useState(false);
  const [store, setStore]           = useState(null);

  // ── n9router settings state ──
  const [settings, setSettings] = useState({});
  const [loading, setLoading]   = useState(true);

  // ── Per-field transient states ──
  const [proxyStatus, setProxyStatus]   = useState({ msg: "", err: false });
  const [passStatus, setPassStatus]     = useState({ msg: "", err: false });
  const [passwords, setPasswords]       = useState({ current: "", new: "", confirm: "" });
  const [passExpanded, setPassExpanded] = useState(false);
  const [proxyExpanded, setProxyExpanded] = useState(false);
  const [proxyUrl, setProxyUrl]         = useState("");
  const [noProxy, setNoProxy]           = useState("");
  const [ideVersion, setIdeVersion]     = useState("1.23.2");
  const [ideVersionStatus, setIdeVersionStatus] = useState({ msg: "", err: false });

  // ── Load tray store ──
  useEffect(() => {
    load("tray-settings.json", { autoSave: true })
      .then(async s => {
        const val = await s.get("autoStartN9router");
        setAutoStart(!!val);
        const kp = await s.get("killPortBeforeStart");
        setKillPort(!!kp);
        const vl = await s.get("verboseLogging");
        setVerboseLog(!!vl);
        setStore(s);
        setStoreReady(true);
      })
      .catch(() => setStoreReady(true));
    // Query autostart plugin state
    invoke("plugin:autostart|is_enabled")
      .then(val => setLaunchAtLogin(!!val))
      .catch(() => {});
  }, []);

  // ── Load n9router settings ──
  useEffect(() => {
    api.getSettings()
      .then(data => {
        setSettings(data);
        setProxyUrl(data.outboundProxyUrl || "");
        setNoProxy(data.outboundNoProxy || "");
        setIdeVersion(data.mitmAntigravityIdeVersion || "1.23.2");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ── Tray setting helpers ──
  const setAutoStartVal = async val => {
    setAutoStart(val);
    if (store) {
      await store.set("autoStartN9router", val);
      await store.save();
    }
  };

  const toggleLaunchAtLogin = async (val) => {
    try {
      await invoke(val ? "plugin:autostart|enable" : "plugin:autostart|disable");
      setLaunchAtLogin(val);
    } catch (e) { console.error("autostart toggle failed", e); }
  };

  const setKillPortVal = async val => {
    setKillPort(val);
    if (store) {
      await store.set("killPortBeforeStart", val);
      await store.save();
    }
  };

  const setVerboseLogVal = async val => {
    setVerboseLog(val);
    if (store) {
      await store.set("verboseLogging", val);
      await store.save();
    }
  };

  // ── n9router patch helper (optimistic) ──
  const patch = async (key, value, onRollback) => {
    try {
      const data = await api.updateSettings({ [key]: value });
      setSettings(prev => ({ ...prev, ...data }));
    } catch (e) {
      if (onRollback) onRollback();
    }
  };

  const patchToggle = (key, currentVal) => {
    const next = !currentVal;
    setSettings(prev => ({ ...prev, [key]: next }));
    patch(key, next, () => setSettings(prev => ({ ...prev, [key]: currentVal })));
  };

  // ── Proxy test ──
  const testProxy = async () => {
    setProxyStatus({ msg: "Testing…", err: false });
    try {
      await api.updateSettings({ outboundProxyUrl: proxyUrl, outboundNoProxy: noProxy });
      setProxyStatus({ msg: "Settings saved. Use web dashboard to test.", err: false });
    } catch (e) {
      setProxyStatus({ msg: String(e), err: true });
    }
    setTimeout(() => setProxyStatus({ msg: "", err: false }), 4000);
  };

  // ── Password change ──
  const handlePasswordChange = async e => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPassStatus({ msg: "Passwords do not match", err: true });
      return;
    }
    try {
      await api.updateSettings({ currentPassword: passwords.current, newPassword: passwords.new });
      setPassStatus({ msg: "Password updated", err: false });
      setPasswords({ current: "", new: "", confirm: "" });
    } catch (err) {
      setPassStatus({ msg: String(err), err: true });
    }
    setTimeout(() => setPassStatus({ msg: "", err: false }), 4000);
  };

  // ── IDE version save ──
  const saveIdeVersion = async e => {
    e.preventDefault();
    try {
      const data = await api.updateSettings({ mitmAntigravityIdeVersion: ideVersion.trim() || "1.23.2" });
      setSettings(prev => ({ ...prev, ...data }));
      setIdeVersionStatus({ msg: "Saved", err: false });
    } catch (err) {
      setIdeVersionStatus({ msg: String(err), err: true });
    }
    setTimeout(() => setIdeVersionStatus({ msg: "", err: false }), 3000);
  };

  // ── Derived booleans ──
  const s = settings;
  const isRR       = s.fallbackStrategy === "round-robin";
  const isComboRR  = s.comboStrategy === "round-robin";
  const proxyOn    = s.outboundProxyEnabled === true;
  const obsEnabled = s.observabilityEnabled !== false;
  const debugLogs  = s.mitmAntigravityDebugLogsEnabled === true;
  const autoDisable = s.mitmAntigravityAutoDisableOnSonnetZero !== false;
  const payGuard   = s.mitmAntigravityPayloadGuardEnabled !== false;
  const hostRW     = s.mitmAntigravityHostRewriteEnabled !== false;
  const ideOverride = s.mitmAntigravityIdeVersionOverrideEnabled === true;
  const maskEmails = s.tokenSwapMaskEmails === true;
  const dbBackups  = s.periodicDbBackupsEnabled !== false;
  const reqLogin   = s.requireLogin === true;

  return (
    <div className="settings-panel">

      {/* ── Section A: Tray Settings ── */}
      <SectionHeader icon="🖥️" title="Tray" />
      <div className="settings-section-body">
        <SettingRow
          label="Launch at Login"
          description="Start this tray app automatically when you sign in"
        >
          <SettingToggle checked={launchAtLogin} onChange={toggleLaunchAtLogin} disabled={!storeReady} />
        </SettingRow>
        <SettingRow
          label="Auto-start n9router on launch"
          description="Automatically start n9router when this tray app opens"
          topBorder
        >
          <SettingToggle checked={autoStart} onChange={setAutoStartVal} disabled={!storeReady} />
        </SettingRow>
        <SettingRow
          label="Kill port before start"
          description="Terminate any process on port 20128 before starting n9router"
          topBorder
        >
          <SettingToggle checked={killPort} onChange={setKillPortVal} disabled={!storeReady} />
        </SettingRow>
        <SettingRow
          label="Verbose Logging"
          description="Write debug logs to ~/.n9tray/debug.log"
          topBorder
        >
          <SettingToggle checked={verboseLog} onChange={setVerboseLogVal} disabled={!storeReady} />
        </SettingRow>
      </div>

      {/* ── Section B: Routing ── */}
      <SectionHeader icon="⚡" title="Routing" />
      <div className="settings-section-body">
        <SettingRow label="Round Robin" description="Cycle through accounts to distribute load">
          <SettingToggle
            checked={isRR}
            onChange={() => {
              const next = isRR ? "fill-first" : "round-robin";
              setSettings(p => ({ ...p, fallbackStrategy: next }));
              patch("fallbackStrategy", next, () =>
                setSettings(p => ({ ...p, fallbackStrategy: s.fallbackStrategy })));
            }}
            disabled={loading}
          />
        </SettingRow>
        {isRR && (
          <SettingRow label="Sticky Limit" description="Calls per account before switching" topBorder>
            <CompactInput
              type="number" min={1} max={10}
              value={s.stickyRoundRobinLimit ?? 3}
              onChange={v => {
                const n = parseInt(v);
                if (n >= 1) {
                  setSettings(p => ({ ...p, stickyRoundRobinLimit: n }));
                  patch("stickyRoundRobinLimit", n);
                }
              }}
              disabled={loading}
            />
          </SettingRow>
        )}
        <SettingRow label="Combo Round Robin" description="Cycle through combo providers instead of fill-first" topBorder>
          <SettingToggle
            checked={isComboRR}
            onChange={() => {
              const next = isComboRR ? "fallback" : "round-robin";
              setSettings(p => ({ ...p, comboStrategy: next }));
              patch("comboStrategy", next, () =>
                setSettings(p => ({ ...p, comboStrategy: s.comboStrategy })));
            }}
            disabled={loading}
          />
        </SettingRow>
        {isComboRR && (
          <SettingRow label="Combo Sticky Limit" description="Calls per combo model before switching" topBorder>
            <CompactInput
              type="number" min={1} max={100}
              value={s.comboStickyRoundRobinLimit ?? 1}
              onChange={v => {
                const n = parseInt(v);
                if (n >= 1) {
                  setSettings(p => ({ ...p, comboStickyRoundRobinLimit: n }));
                  patch("comboStickyRoundRobinLimit", n);
                }
              }}
              disabled={loading}
            />
          </SettingRow>
        )}
      </div>

      {/* ── Section C: Security ── */}
      <SectionHeader icon="🔒" title="Security" />
      <div className="settings-section-body">
        <SettingRow label="Require Login" description="Dashboard requires password when ON">
          <SettingToggle checked={reqLogin} onChange={() => patchToggle("requireLogin", reqLogin)} disabled={loading} />
        </SettingRow>
        {reqLogin && (
          <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 6 }}>
            <button
              className="settings-expand-btn"
              onClick={() => setPassExpanded(v => !v)}
            >
              {passExpanded ? "▾" : "▸"} Change Password
            </button>
            {passExpanded && (
              <form onSubmit={handlePasswordChange} style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                <CompactInput
                  type="password" placeholder="Current password"
                  value={passwords.current}
                  onChange={v => setPasswords(p => ({ ...p, current: v }))}
                />
                <CompactInput
                  type="password" placeholder="New password"
                  value={passwords.new}
                  onChange={v => setPasswords(p => ({ ...p, new: v }))}
                />
                <CompactInput
                  type="password" placeholder="Confirm new"
                  value={passwords.confirm}
                  onChange={v => setPasswords(p => ({ ...p, confirm: v }))}
                />
                <button type="submit" className="settings-action-btn" style={{ marginTop: 2 }}>
                  Update Password
                </button>
                <StatusNote msg={passStatus.msg} isError={passStatus.err} />
              </form>
            )}
          </div>
        )}
      </div>

      {/* ── Section D: Network ── */}
      <SectionHeader icon="🌐" title="Network" />
      <div className="settings-section-body">
        <SettingRow label="Outbound Proxy" description="Proxy for OAuth + provider outbound requests">
          <SettingToggle
            checked={proxyOn}
            onChange={() => patchToggle("outboundProxyEnabled", proxyOn)}
            disabled={loading}
          />
        </SettingRow>
        {proxyOn && (
          <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 6, display: "flex", flexDirection: "column", gap: 5 }}>
            <CompactInput
              placeholder="http://127.0.0.1:7897"
              value={proxyUrl}
              onChange={setProxyUrl}
            />
            <CompactInput
              placeholder="No-proxy: localhost,127.0.0.1"
              value={noProxy}
              onChange={setNoProxy}
            />
            <div style={{ display: "flex", gap: 5 }}>
              <button className="settings-action-btn" onClick={testProxy}>Save Proxy</button>
            </div>
            <StatusNote msg={proxyStatus.msg} isError={proxyStatus.err} />
          </div>
        )}
      </div>

      {/* ── Section E: Observability ── */}
      <SectionHeader icon="🔭" title="Observability" />
      <div className="settings-section-body">
        <SettingRow label="Enable Observability" description="Record request details for logs view">
          <SettingToggle checked={obsEnabled} onChange={() => patchToggle("observabilityEnabled", obsEnabled)} disabled={loading} />
        </SettingRow>
        <SettingRow label="MITM Debug Logs" description="Write Antigravity MITM requests to debug log files" topBorder>
          <SettingToggle checked={debugLogs} onChange={() => patchToggle("mitmAntigravityDebugLogsEnabled", debugLogs)} disabled={loading} />
        </SettingRow>
        <SettingRow label="Auto-disable Empty Sonnet" description="Disable Antigravity account when Sonnet 4.6 quota is 0%" topBorder>
          <SettingToggle checked={autoDisable} onChange={() => patchToggle("mitmAntigravityAutoDisableOnSonnetZero", autoDisable)} disabled={loading} />
        </SettingRow>
        <SettingRow label="Payload Guard" description="Only token-swap for Antigravity IDE requests" topBorder>
          <SettingToggle checked={payGuard} onChange={() => patchToggle("mitmAntigravityPayloadGuardEnabled", payGuard)} disabled={loading} />
        </SettingRow>
        <SettingRow label="Host Rewrite" description="Rewrite to daily-cloudcode-pa.googleapis.com to avoid 429s" topBorder>
          <SettingToggle checked={hostRW} onChange={() => patchToggle("mitmAntigravityHostRewriteEnabled", hostRW)} disabled={loading} />
        </SettingRow>
        <SettingRow label="IDE Version Override" description="Replace Antigravity token-swap version metadata" topBorder>
          <SettingToggle checked={ideOverride} onChange={() => patchToggle("mitmAntigravityIdeVersionOverrideEnabled", ideOverride)} disabled={loading} />
        </SettingRow>
        {ideOverride && (
          <form onSubmit={saveIdeVersion} style={{
            borderTop: "1px solid var(--border-light)", paddingTop: 6,
            display: "flex", gap: 5, alignItems: "center",
          }}>
            <CompactInput
              placeholder="1.23.2"
              value={ideVersion}
              onChange={setIdeVersion}
            />
            <button type="submit" className="settings-action-btn">Save</button>
            <StatusNote msg={ideVersionStatus.msg} isError={ideVersionStatus.err} />
          </form>
        )}
      </div>

      {/* ── Section F: Data ── */}
      <SectionHeader icon="💾" title="Data" />
      <div className="settings-section-body" style={{ paddingBottom: 12 }}>
        <SettingRow label="Mask Emails" description="Hide email addresses across the tray interface">
          <SettingToggle checked={maskEmails} onChange={() => patchToggle("tokenSwapMaskEmails", maskEmails)} disabled={loading} />
        </SettingRow>
        <SettingRow label="Hourly DB Backups" description="Keep hourly snapshots for 3 days in ~/.n9router/backups" topBorder>
          <SettingToggle checked={dbBackups} onChange={() => patchToggle("periodicDbBackupsEnabled", dbBackups)} disabled={loading} />
        </SettingRow>
      </div>

    </div>
  );
}
