/**
 * Format token count: 1234 → "1.2k", 1234567 → "1.2M"
 */
export function formatTokens(n) {
  if (n == null || isNaN(n)) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

/**
 * Format cost: 0.82 → "$0.82"
 */
export function formatCost(n) {
  if (n == null || isNaN(n)) return "$0.00";
  if (n >= 100) return "$" + Math.round(n);
  if (n >= 10) return "$" + n.toFixed(1);
  return "$" + n.toFixed(2);
}

/**
 * Format time from ISO string: "22:51"
 */
export function formatTime(iso) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Relative time from ISO string: "5m ago", "14h ago", "3d ago"
 */
export function timeAgo(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "—";
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 10) return "now";
  if (s < 60) return `${Math.floor(s)}s ago`;
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Shorten model name: "claude-sonnet-4-20250514" → "claude-sonnet-4"
 */
export function shortModel(model) {
  if (!model) return "—";
  // Remove date suffixes like -20250514
  return model.replace(/-\d{8}$/, "").replace(/-latest$/, "");
}
