/**
 * Default connection row — for providers without special quota handling
 * (kiro, xai, copilot, etc.)
 *
 * Shows all available quotas generically.
 */
import { useState } from "react";
import {
  StatusDot, ActiveToggle, Chevron, AccountTypeBadge,
  QuotaBar, QuotaSummaryInline, formatResetTime, displayEmail,
} from "./shared";

export default function DefaultConnection({ conn, quota, onToggle, toggling, maskEmails }) {
  const [expanded, setExpanded] = useState(false);
  const allQuotas = quota?.quotas || [];
  const hasDetail = allQuotas.length > 0;

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
              {conn.name || displayEmail(conn.email, maskEmails) || conn.id.slice(0, 8)}
            </span>
            <AccountTypeBadge type={conn.accountType || quota?.plan} />
          </div>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1 }}>
            {displayEmail(conn.email, maskEmails) || conn.authType}
          </div>
          {/* Inline: first quota */}
          {!expanded && allQuotas[0] && <QuotaSummaryInline q={allQuotas[0]} />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ActiveToggle isActive={conn.isActive} toggling={toggling} onClick={() => onToggle(conn.id, !conn.isActive)} />
          {hasDetail && <Chevron expanded={expanded} />}
        </div>
      </div>

      {/* Expanded: all quotas */}
      {expanded && (
        <div className="provider-accounts" style={{ padding: "6px 12px 10px 26px", background: "rgba(0,0,0,0.15)" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.05em", marginBottom: 4, textTransform: "uppercase" }}>
            Quota
          </div>
          {allQuotas.map(q => <QuotaBar key={q.key} q={q} showUsed />)}
          {allQuotas[0]?.resetAt && (() => {
            const r = formatResetTime(allQuotas[0].resetAt);
            return r ? <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>Reset in {r}</div> : null;
          })()}
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
