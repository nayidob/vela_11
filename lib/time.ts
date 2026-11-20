export const TZ = "America/Bogota";

export function clock(ts: number, withSeconds = false) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
  }).format(ts);
}

export function shortDate(ts: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
  }).format(ts);
}

export function ago(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

export function duration(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export function caseNumber(ts: number, seq: number) {
  const d = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "2-digit", day: "2-digit" })
    .formatToParts(ts)
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  return `VN-${d.month}${d.day}-${String(seq).padStart(4, "0")}`;
}
