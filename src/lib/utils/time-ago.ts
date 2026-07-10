/**
 * Formats a date into a human-readable relative time string in Italian.
 * Accepts both Date objects and ISO strings (from server→client serialization).
 *
 * Examples: "Adesso", "5m fa", "3h fa", "2g fa", "15 mar"
 */
export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Adesso";
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}g fa`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
