/**
 * Codex connection row.
 *
 * Shows both session (5h) and weekly usage limits.
 * Quota shape: { session: { used, total, remaining, resetAt }, weekly: { ... } }
 */
import { useState } from "react";
import {
  StatusDot, ActiveToggle, Chevron, AccountTypeBadge,
  QuotaBar, formatResetTime, getBarColor,
} from "./shared";

function getQuotaByKey(quotas, key) {
  return quotas.find(q => q.key === key) || null;
}

/** Dual-bar inline summary (both session and weekly in collapsed state) */
function CodexInlineSummary({ session, weekly }) {
  if (!session && !weekly) return null;
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 2, fontSize: 9, color: "var(--text-tertiary)" }}>
      {session && (
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span>5h</span>
          <div style={{ width: 30, height: 3, borderRadius: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${session.pct ?? 0}%`, background: getBarColor(session.pct ?? 0), borderRadius: 2 }} />
          </div>
          <span style={{ color: getBarColor(session.pct ?? 0), fontWeight: 600 }}>{session.pct}%</span>
        </div>
      )}
      {weekly && (
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span>week</span>
          <div style={{ width: 30, height: 3, borderRadius: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${weekly.pct ?? 0}%`, background: getBarColor(weekly.pct ?? 0), borderRadius: 2 }} />
          </div>
          <span style={{ color: getBarColor(weekly.pct ?? 0), fontWeight: 600 }}>{weekly.pct}%</span>
        </div>
      )}
    </div>
  );
}

export default function CodexConnection({ conn, quota, onToggle, toggling }) {
  const [expanded, setExpanded] = useState(false);
  const allQuotas = quota?.quotas || [];
  const session = getQuotaByKey(allQuotas, "session");
  const weekly = getQuotaByKey(allQuotas, "weekly");
  const hasDetail = session || weekly;

  return (
    <div style={{ borderBottom: "1px solid var(--border-light)" }}>
      {/* Header */}
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
            <AccountTypeBadge type={quota?.plan || conn.accountType} />
            {quota?.raw?.limitReached && (
              <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: "rgba(255,69,58,0.15)", color: "var(--red)", border: "1px solid rgba(255,69,58,0.3)" }}>LIMIT</span>
            )}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1 }}>
            {conn.email || conn.authType}
          </div>
          {/* Inline: both bars when collapsed */}
          {!expanded && <CodexInlineSummary session={session} weekly={weekly} />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ActiveToggle isActive={conn.isActive} toggling={toggling} onClick={() => onToggle(conn.id, !conn.isActive)} />
          {hasDetail && <Chevron expanded={expanded} />}
        </div>
      </div>

      {/* Expanded: full bars for both limits */}
      {expanded && (
        <div className="provider-accounts" style={{ padding: "6px 12px 10px 26px", background: "rgba(0,0,0,0.15)" }}>
          {session && (
            <div style={{ marginBottom: weekly ? 8 : 0 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.05em", marginBottom: 4, textTransform: "uppercase" }}>
                Session Limit (5h)
              </div>
              <QuotaBar q={{ ...session, name: "Session" }} showUsed />
              {session.resetAt && (() => {
                const r = formatResetTime(session.resetAt);
                return r ? <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>Resets in {r}</div> : null;
              })()}
            </div>
          )}
          {weekly && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.05em", marginBottom: 4, textTransform: "uppercase" }}>
                Weekly Limit
              </div>
              <QuotaBar q={{ ...weekly, name: "Weekly" }} showUsed />
              {weekly.resetAt && (() => {
                const r = formatResetTime(weekly.resetAt);
                return r ? <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>Resets in {r}</div> : null;
              })()}
            </div>
          )}

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
