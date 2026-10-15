import type { SessionSummaryDTO } from '@psc/shared';
import type { ResultBucket } from '@/components/charts/ResultsChart';

const DAY = 86_400_000;

export const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Groups session results into day buckets (≤31 days) or week buckets, ending today. */
export function buildBuckets(sessions: SessionSummaryDTO[], days: number): { buckets: ResultBucket[]; unit: 'day' | 'week' } {
  const today = startOfDay(Date.now());
  const span = Number.isFinite(days) ? days : Math.max(7, Math.ceil((today - Math.min(today, ...sessions.map((s) => startOfDay(s.startedAt)))) / DAY) + 1);
  const unit = span <= 31 ? 'day' : 'week';
  const size = unit === 'day' ? 1 : 7;
  const n = Math.ceil(span / size);
  const buckets: ResultBucket[] = Array.from({ length: n }, (_, i) => {
    const start = today - (n - 1 - i) * size * DAY;
    const d = new Date(start);
    return {
      key: String(start),
      label: unit === 'day' ? String(d.getDate()) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      title: d.toLocaleDateString(undefined, { weekday: unit === 'day' ? 'short' : undefined, month: 'short', day: 'numeric' }),
      correct: 0,
      partial: 0,
      incorrect: 0,
    };
  });
  const first = today - (n - 1) * size * DAY;
  for (const s of sessions) {
    const idx = Math.floor((startOfDay(s.startedAt) - first) / (size * DAY));
    const b = buckets[idx];
    if (!b) continue;
    b.correct += s.results.correct;
    b.partial += s.results.partial;
    b.incorrect += s.results.incorrect;
  }
  return { buckets, unit };
}

