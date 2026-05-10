/**
 * Shared utilities for provider connection components.
 */

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

export function getIconUrl(provider) {
  const key = (provider || "").toLowerCase().replace(/[_\s]/g, "-");
  return PROVIDER_ICON_FILE[key] ? `${N9_BASE}/providers/${PROVIDER_ICON_FILE[key]}` : null;
}

export function ProviderIcon({ provider, name, size = 26 }) {
  const src = getIconUrl(provider);
  const r = Math.round(size * 0.22);
  if (!src) return (
    <div style={{ width: size, height: size, borderRadius: r, background: "var(--bg-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.45, fontWeight: 700, color: "var(--text-secondary)", flexShrink: 0 }}>
      {(name || provider || "?")[0].toUpperCase()}
    </div>
  );
  return <img src={src} width={size} height={size} alt={provider} onError={e => { e.currentTarget.style.display = "none"; }} style={{ borderRadius: r, objectFit: "contain", flexShrink: 0, display: "block", background: "var(--bg-secondary)" }} />;
}

// ── Color helpers ───────────────────────────────────────────────────────────

export function getBarColor(pct) {
  if (pct > 70) return "var(--green)";
  if (pct >= 30) return "var(--yellow)";
  return "var(--red)";
}

// ── Time helpers ────────────────────────────────────────────────────────────

export function formatResetTime(date) {
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

// ── Quota normalization ─────────────────────────────────────────────────────

export function normalizeQuotas(data) {
  if (!data?.quotas) return [];
  return Object.entries(data.quotas).map(([key, q]) => {
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

// ── Shared sub-components ───────────────────────────────────────────────────

/** Full quota bar with label, bar, percentage, used/total */
export function QuotaBar({ q, showUsed = false }) {
  const color = getBarColor(q.pct ?? 0);
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
        <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{q.name}</span>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 6 }}>
          {showUsed && q.total > 0 && <span style={{ color: "var(--text-tertiary)" }}>{q.used}/{q.total}</span>}
          <span style={{ color, fontWeight: 600 }}>{q.pct != null ? `${q.pct}%` : "—"}</span>
        </div>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${q.pct ?? 0}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

/** Compact single-line quota summary shown in collapsed state */
export function QuotaSummaryInline({ q }) {
  if (!q || q.pct == null) return null;
  const color = getBarColor(q.pct);
  const reset = formatResetTime(q.resetAt);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>{q.name}</span>
      <div style={{ flex: 1, minWidth: 30, maxWidth: 50, height: 3, borderRadius: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${q.pct}%`, background: color, borderRadius: 2 }} />
      </div>
      <span style={{ color, fontWeight: 600 }}>{q.pct}%</span>
      {reset && <span>· {reset}</span>}
    </div>
  );
}

/** Account type badge (Pro, Ultra, Free, plus) */
export function AccountTypeBadge({ type }) {
  if (!type || type === "-") return null;
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  const colors = {
    Ultra: { bg: "rgba(255,214,10,0.15)", fg: "var(--yellow)", border: "rgba(255,214,10,0.3)" },
    Pro:   { bg: "rgba(66,133,244,0.15)", fg: "#4285F4", border: "rgba(66,133,244,0.3)" },
    Plus:  { bg: "rgba(66,133,244,0.15)", fg: "#4285F4", border: "rgba(66,133,244,0.3)" },
    plus:  { bg: "rgba(66,133,244,0.15)", fg: "#4285F4", border: "rgba(66,133,244,0.3)" },
  };
  const c = colors[type] || { bg: "var(--bg-tertiary)", fg: "var(--text-tertiary)", border: "var(--border-light)" };
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
      textTransform: "uppercase", letterSpacing: "0.04em",
    }}>{label}</span>
  );
}

/** Status dot for account health */
export function StatusDot({ testStatus }) {
  const active = testStatus === "active";
  return (
    <div style={{
      width: 7, height: 7, borderRadius: 4,
      background: active ? "var(--green)" : testStatus === "unavailable" ? "var(--red)" : "var(--text-tertiary)",
      flexShrink: 0,
      boxShadow: active ? "0 0 4px rgba(48,209,88,0.4)" : "none",
    }} />
  );
}

/** isActive toggle button (scaled down) */
export function ActiveToggle({ isActive, toggling, onClick }) {
  return (
    <button
      className={`toggle-switch ${isActive ? "on" : ""} ${toggling ? "loading" : ""}`}
      style={{ transform: "scale(0.7)", transformOrigin: "right center" }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={toggling}
    />
  );
}

/** Expand chevron */
export function Chevron({ expanded }) {
  return (
    <span style={{ fontSize: 8, color: "var(--text-tertiary)", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none", display: "inline-block" }}>▼</span>
  );
}
