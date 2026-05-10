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
 * Shorten model name: "claude-sonnet-4-20250514" → "claude-sonnet-4"
 */
export function shortModel(model) {
  if (!model) return "—";
  // Remove date suffixes like -20250514
  return model.replace(/-\d{8}$/, "").replace(/-latest$/, "");
}
