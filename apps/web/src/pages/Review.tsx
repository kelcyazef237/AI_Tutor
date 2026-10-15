import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CalendarClock, CalendarDays, CheckCircle2, Eye, Hourglass, Loader2, RotateCcw, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AREAS, type ConceptStateDTO } from '@psc/shared';
import { ReviewForecast } from '@/components/charts/ReviewForecast';
import { useAIStatus } from '@/components/layout/AIStatusPill';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { LoadError } from '@/components/ui/load-error';

const DAY = 86_400_000;

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function fmtInterval(h: number) {
  if (h < 24) return `${Math.round(h)}h`;
  if (h < 24 * 14) return `${Math.round(h / 24)}d`;
  if (h < 24 * 60) return `${Math.round(h / 24 / 7)}w`;
  return `${Math.round(h / 24 / 30)}mo`;
}

function fmtDue(ts: number, now: number) {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const s = abs < 3_600_000 ? `${Math.max(1, Math.round(abs / 60_000))}m` : abs < DAY ? `${Math.round(abs / 3_600_000)}h` : `${Math.round(abs / DAY)}d`;
  return diff < 0 ? `${s} overdue` : `in ${s}`;
}

type Item = ConceptStateDTO & { nextReview: number };

/* ── Pieces ─────────────────────────────────────────────────── */

function StatTile({ icon: Icon, label, value, sub, tone }: { icon: LucideIcon; label: string; value: number; sub: string; tone?: 'warning' }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Icon className={tone === 'warning' && value > 0 ? 'size-4 text-warning' : 'size-4'} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-faint">{sub}</div>
    </Card>
  );
}

function Row({ c, now }: { c: Item; now: number }) {
  const overdue = c.nextReview < now;
  return (
    <li>
      <Link to={`/skills?c=${c.conceptId}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{c.name}</span>
            {c.status === 'at-risk' && (
              <Badge tone="danger">
                <AlertTriangle className="size-3" /> At risk
              </Badge>
            )}
          </div>
          <div className="truncate text-xs text-faint">
            {c.domainName} · interval {fmtInterval(c.intervalHours)} · {c.attempts} {c.attempts === 1 ? 'attempt' : 'attempts'}
          </div>
        </div>
        <div className="hidden w-28 shrink-0 sm:block" title={`${Math.round((c.mastery / 7) * 100)}% mastery`}>
          <div className="mb-1 text-right text-xs tabular-nums text-muted">{Math.round((c.mastery / 7) * 100)}%</div>
          <div className="h-1 overflow-hidden rounded-full bg-accent-soft">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (c.mastery / 7) * 100)}%` }} />
          </div>
        </div>
        <div className={`w-24 shrink-0 text-right text-xs font-medium tabular-nums ${overdue ? 'text-warning' : 'text-muted'}`}>{fmtDue(c.nextReview, now)}</div>
      </Link>
    </li>
  );
}

function Group({ title, icon: Icon, count, children, note }: { title: string; icon: LucideIcon; count: number; children: ReactNode; note?: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Icon className="size-4 text-muted" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge className="ml-1">{count}</Badge>
        {note && <span className="ml-auto text-xs text-faint">{note}</span>}
      </div>
      <ul className="divide-y divide-border">{children}</ul>
    </Card>
  );
}

/* ── Page ───────────────────────────────────────────────────── */

export function ReviewPage() {
  const navigate = useNavigate();
  const ai = useAIStatus();
  const q = useQuery({ queryKey: ['concepts'], queryFn: api.concepts, retry: false });
  const [area, setArea] = useState('all');

  const data = q.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [data]);

  const groups = useMemo(() => {
    const scheduled = (data ?? [])
      .filter((c): c is Item => c.nextReview !== null && c.attempts > 0)
      .filter((c) => area === 'all' || c.area === area)
      .sort((a, b) => a.nextReview - b.nextReview);
    const endToday = startOfDay(now) + DAY;
    const endWeek = startOfDay(now) + 8 * DAY;
    const overdue = scheduled.filter((c) => c.nextReview < now);
    const today = scheduled.filter((c) => c.nextReview >= now && c.nextReview < endToday);
    const week = scheduled.filter((c) => c.nextReview >= endToday && c.nextReview < endWeek);
    const later = scheduled.filter((c) => c.nextReview >= endWeek);

    // Forecast series for the chart: next 14 days, today first
    const counts = new Map<string, number>();
    for (const c of scheduled) if (c.nextReview >= now) counts.set(dayKey(c.nextReview), (counts.get(dayKey(c.nextReview)) ?? 0) + 1);
    const forecast = Array.from({ length: 14 }, (_, i) => {
      const day = dayKey(startOfDay(now) + i * DAY + DAY / 2);
      return { day, count: counts.get(day) ?? 0 };
    });

    // Upcoming week grouped by day
    const byDay = new Map<string, Item[]>();
    for (const c of week) byDay.set(dayKey(c.nextReview), [...(byDay.get(dayKey(c.nextReview)) ?? []), c]);

    return { scheduled, overdue, today, week, later, forecast, byDay };
  }, [data, area, now]);

  const start = useMutation({
    mutationFn: () => api.startSession({ mode: 'review', domains: [] }),
    onSuccess: (s) => navigate(`/session/${s.id}`),
    onError: (e: Error) => toast.error('Could not start the review session', { description: e.message }),
  });

  const dueNow = groups.overdue.length + groups.today.length;

  const header = (
    <PageHeader
      title="Review"
      description="Spaced review keeps what you've learned from decaying. Failed reviews return the concept to active training."
      actions={
        <>
          <Button disabled={ai.isError || start.isPending || dueNow === 0} onClick={() => start.mutate()} title={ai.isError ? 'The backend is not running' : undefined}>
            {start.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Start review session
          </Button>
        </>
      }
    />
  );

  if (q.isError) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;

  if (!data) {
    return (
      <>
        {header}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="mt-6 h-72 rounded-xl" />
      </>
    );
  }

  const next = groups.week[0] ?? groups.later[0];

  return (
    <>
      {header}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Select value={area} onChange={(e) => setArea(e.target.value)} className="w-auto" aria-label="Area">
          <option value="all">All areas</option>
          {AREAS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon={AlertTriangle} label="Overdue" value={groups.overdue.length} sub={groups.overdue.length ? 'Review these first' : 'Nothing overdue'} tone="warning" />
        <StatTile icon={Hourglass} label="Due today" value={groups.today.length} sub="Before midnight" />
        <StatTile icon={CalendarDays} label="Next 7 days" value={groups.week.length} sub="After today" />
        <StatTile icon={CalendarClock} label="Scheduled" value={groups.scheduled.length} sub={`${groups.later.length} further out`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {dueNow === 0 ? (
            <Card>
              <EmptyState icon={CheckCircle2} title="All caught up">
                {next ? (
                  <>
                    Next review: <span className="font-medium text-text">{next.name}</span>, {fmtDue(next.nextReview, now)}.
                  </>
                ) : (
                  'Nothing is scheduled yet. Concepts join the queue after you are assessed on them.'
                )}
              </EmptyState>
            </Card>
          ) : (
            <>
              {groups.overdue.length > 0 && (
                <Group title="Overdue" icon={AlertTriangle} count={groups.overdue.length} note="Most overdue first">
                  {groups.overdue.map((c) => (
                    <Row key={c.conceptId} c={c} now={now} />
                  ))}
                </Group>
              )}
              {groups.today.length > 0 && (
                <Group title="Due today" icon={Hourglass} count={groups.today.length}>
                  {groups.today.map((c) => (
                    <Row key={c.conceptId} c={c} now={now} />
                  ))}
                </Group>
              )}
              <div className="flex justify-end">
                <Button variant="secondary" disabled={ai.isError || start.isPending} onClick={() => start.mutate()}>
                  Review {dueNow} now <ArrowRight />
                </Button>
              </div>
            </>
          )}

          {groups.byDay.size > 0 && (
            <Group title="Coming up this week" icon={CalendarDays} count={groups.week.length}>
              {[...groups.byDay.entries()].map(([day, items]) => (
                <li key={day}>
                  <div className="bg-surface-2/60 px-5 py-1.5 text-xs font-medium text-muted">
                    {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </div>
                  <ul className="divide-y divide-border">
                    {items.map((c) => (
                      <Row key={c.conceptId} c={c} now={now} />
                    ))}
                  </ul>
                </li>
              ))}
            </Group>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <ReviewForecast forecast={groups.forecast} overdue={groups.overdue.length} />
          <Card className="p-5 text-sm text-muted">
            <h3 className="mb-2 text-sm font-semibold text-text">How the queue works</h3>
            <p>Each successful review pushes a concept's next review further out. A failed or weak review shortens the interval and brings the concept back into training sessions.</p>
            <p className="mt-2">Click any concept to open it on the Skill Map.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
