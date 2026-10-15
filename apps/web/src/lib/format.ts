/** Small, dependency-free formatting helpers shared by the session, goals and analytics pages. */

export const pctOf7 = (m: number) => `${Math.round((Math.max(0, Math.min(7, m)) / 7) * 100)}%`;

/** Signed delta in percentage points on the 0..7 scale, e.g. "+6 pts". */
export function deltaPts(before: number, after: number) {
  const d = Math.round(((after - before) / 7) * 100);
  return { value: d, label: `${d >= 0 ? '+' : '−'}${Math.abs(d)} pts` };
}

/** "mm:ss" or "h:mm:ss". */
export function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Relative time in either direction: "in 3 days", "2h ago", "now". */
export function relative(ts: number, now = Date.now()) {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86_400_000 * 30, 'month'],
    [86_400_000 * 7, 'week'],
    [86_400_000, 'day'],
    [3_600_000, 'hour'],
    [60_000, 'minute'],
  ];
  for (const [size, name] of units) {
    if (abs >= size) {
      const n = Math.round(abs / size);
      const label = `${n} ${name}${n === 1 ? '' : 's'}`;
      return diff > 0 ? `in ${label}` : `${label} ago`;
    }
  }
  return 'now';
}

export function fmtMinutes(ms: number) {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function dayKey(d: Date | number) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
