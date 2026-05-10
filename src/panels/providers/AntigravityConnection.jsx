/**
 * Antigravity connection row.
 *
 * - Shows only claude-sonnet-4-6 quota (matching Token Swap highlight)
 * - Health dots strip from account-health API (like MITM page)
 * - Account type badge (Pro/Ultra/Free)
 * - Token expiry
 */
import { useState } from "react";
import {
  StatusDot, ActiveToggle, Chevron, AccountTypeBadge,
  QuotaBar, QuotaSummaryInline, formatResetTime, getBarColor,
} from "./shared";

const HIGHLIGHT_KEY = "claude-sonnet-4-6";

function getHighlightQuota(quotas) {
  return quotas.find(q => q.key === HIGHLIGHT_KEY || q.key?.includes("sonnet")) || quotas[0] || null;
}

// ── Health dot colors (same logic as TokenSwapPoolCard) ─────────────────────

function getHealthDotColor(event) {
  if (event.status === "success") return "#22c55e";
  if (event.status === "fail") return "#ef4444";
  if (event.attempts <= 2) return "#fb923c";
  if (event.attempts <= 3) return "#f97316";
  return "#ea580c";
}

function isToday(ts) {
  const now = new Date();
  const d = new Date(ts);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function HealthDotStrip({ events, compact = false }) {
  if (!events || events.length === 0) return null;

  // Compact mode: show last 50 dots in a single row, no summary text
  const shown = compact ? events.slice(-50) : events;

  const ok = events.filter(e => e.status === "success").length;
  const retry = events.filter(e => e.status === "retry_success").length;
  const fail = events.filter(e => e.status === "fail").length;

  return (
    <div style={{ marginTop: compact ? 3 : 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 1.5 : 2 }}>
        {shown.map((ev, i) => {
          const today = isToday(ev.ts);
          const color = getHealthDotColor(ev);
          const dotSize = compact ? (today ? 5 : 4) : (today ? 7 : 6);
          const time = new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          let title = `${time} — `;
          if (ev.status === "success") title += "✅ Success";
          else if (ev.status === "fail") title += "❌ Failed";
          else title += `🔄 Success after ${ev.attempts || 1} attempt${(ev.attempts || 1) !== 1 ? "s" : ""}`;
          if (ev.model) title += ` (${ev.model})`;

          return (
            <div key={i} title={title} style={{
              width: dotSize,
              height: dotSize,
              borderRadius: 1,
              background: color,
              opacity: today ? 1 : 0.45,
              boxShadow: today ? `0 0 ${compact ? 3 : 5}px 1px ${color}` : undefined,
            }} />
          );
        })}
      </div>
      {!compact && (
        <div style={{ display: "flex", gap: 6, marginTop: 3, fontSize: 9, color: "var(--text-tertiary)" }}>
          <span>last {events.length} calls</span>
          {ok > 0 && <span style={{ color: "var(--green)" }}>{ok} ok</span>}
          {retry > 0 && <span style={{ color: "var(--yellow)" }}>{retry} retry</span>}
          {fail > 0 && <span style={{ color: "var(--red)" }}>{fail} fail</span>}
        </div>
      )}
    </div>
  );
}

export default function AntigravityConnection({ conn, quota, healthEvents, onToggle, toggling }) {
  const [expanded, setExpanded] = useState(false);
  const allQuotas = quota?.quotas || [];
  const highlight = getHighlightQuota(allQuotas);
  const hasDetail = highlight || healthEvents?.length > 0;

  return (
    <div style={{ borderBottom: "1px solid var(--border-light)" }}>
      {/* Header row */}
      <div
        className="provider-account-row"
        onClick={() => hasDetail && setExpanded(e => !e)}
        style={{ cursor: hasDetail ? "pointer" : "default" }}
      >
        <StatusDot testStatus={conn.testStatus} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {conn.name || conn.email || conn.id.slice(0, 8)}
            </span>
            <AccountTypeBadge type={conn.accountType || quota?.plan} />
          </div>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1 }}>
            {conn.email || conn.authType}
          </div>
          {/* Inline Sonnet 4.6 quota bar when collapsed */}
          {!expanded && highlight && <QuotaSummaryInline q={highlight} />}
          {/* Compact health dots when collapsed */}
          {!expanded && healthEvents?.length > 0 && <HealthDotStrip events={healthEvents} compact />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ActiveToggle isActive={conn.isActive} toggling={toggling} onClick={() => onToggle(conn.id, !conn.isActive)} />
          {hasDetail && <Chevron expanded={expanded} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="provider-accounts" style={{ padding: "6px 12px 10px 26px", background: "rgba(0,0,0,0.15)" }}>
          {/* Sonnet 4.6 quota */}
          {highlight && (
            <div style={{ marginBottom: healthEvents?.length ? 8 : 0 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.05em", marginBottom: 4, textTransform: "uppercase" }}>
                Sonnet 4.6 Quota
              </div>
              <QuotaBar q={highlight} showUsed />
              {highlight.resetAt && (() => {
                const r = formatResetTime(highlight.resetAt);
                return r ? <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>Reset in {r}</div> : null;
              })()}
            </div>
          )}

          {/* Health dots */}
          {healthEvents?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.05em", marginBottom: 3, textTransform: "uppercase" }}>
                Health
              </div>
              <HealthDotStrip events={healthEvents} />
            </div>
          )}

          {/* Token expiry */}
          {conn.expiresAt && (
            <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 6 }}>
              Token expires: {new Date(conn.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
