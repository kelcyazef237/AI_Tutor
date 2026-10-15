import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Circle, CircleDot, Clock, Eye, Hourglass, ListChecks, Network, Target, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MODES, type ConceptStateDTO, type DashboardDTO, type SessionMode, type SessionSummaryDTO } from '@psc/shared';
import { CalibrationChart, RetentionCard } from '@/components/charts/CalibrationChart';
import { ChartCard } from '@/components/charts/ChartCard';
import { MasteryTrend } from '@/components/charts/MasteryTrend';
import { ResultsChart } from '@/components/charts/ResultsChart';
import { pct, TooltipBox } from '@/components/charts/Tooltip';
import { useChartTheme } from '@/components/charts/useChartTheme';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { buildBuckets, startOfDay } from '@/lib/buckets';
import { dayKey, fmtMinutes } from '@/lib/format';
import { LoadError } from '@/components/ui/load-error';
import { cn } from '@/lib/utils';

const DAY = 86_400_000;
const RANGES = [
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: Infinity },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

type Status = ConceptStateDTO['status'];
/** Ordered sequential ramp (one hue) for the concept-status bar; always paired with icon + label. */
export const STATUS_ORDER: { key: Status; label: string; icon: LucideIcon; heat: number }[] = [
  { key: 'unknown', label: 'Not assessed', icon: Circle, heat: 0 },
  { key: 'learning', label: 'Learning', icon: CircleDot, heat: 1 },
  { key: 'review-due', label: 'Review due', icon: Hourglass, heat: 2 },
  { key: 'at-risk', label: 'At risk', icon: AlertTriangle, heat: 3 },
  { key: 'solid', label: 'Solid', icon: CheckCircle2, heat: 4 },
];

const sessionMs = (s: SessionSummaryDTO) => (s.endedAt ? Math.max(0, s.endedAt - s.startedAt) : 0);
const graded = (s: SessionSummaryDTO) => s.results.correct + s.results.partial + s.results.incorrect;

/* ── Pieces ─────────────────────────────────────────────────────── */

function Kpi({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string | number; sub?: string }) {
  return (
    <Card className="min-w-0 p-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Icon className="size-4" /> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </Card>
  );
}

interface ModeRow {
  mode: SessionMode;
  name: string;
  accuracy: number;
  correct: number;
  answers: number;
}

function AccuracyByMode({ rows }: { rows: ModeRow[] }) {
  const t = useChartTheme();
  return (
    <ChartCard
      title="Accuracy by mode"
      description="Share of graded answers marked correct."
      rows={rows}
      columns={[
        { key: 'm', header: 'Mode', cell: (r) => r.name },
        { key: 'a', header: 'Accuracy', cell: (r) => pct(r.accuracy), align: 'right' },
        { key: 'n', header: 'Answers', cell: (r) => r.answers, align: 'right' },
      ]}
    >
      {rows.length ? (
        <div style={{ height: rows.length * 36 + 28 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }} barCategoryGap={10}>
              <CartesianGrid horizontal={false} stroke={t.grid} />
              <XAxis type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={pct} tick={{ fill: t.faint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fill: t.muted, fontSize: 12 }} axisLine={{ stroke: t.grid }} tickLine={false} />
              <Tooltip
                cursor={{ fill: t.grid, opacity: 0.5 }}
                content={({ active, payload }) => {
                  const r = payload?.[0]?.payload as ModeRow | undefined;
                  if (!active || !r) return null;
                  return (
                    <TooltipBox
                      title={r.name}
                      rows={[
                        { key: 'a', value: pct(r.accuracy), label: 'correct' },
                        { key: 'n', value: `${r.correct}/${r.answers}`, label: 'answers', swatch: 'none' },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="accuracy" fill={t.c1} barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                <LabelList dataKey="accuracy" position="right" formatter={(v: unknown) => pct(Number(v))} fill={t.muted} fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-faint">No graded answers in this range.</p>
      )}
    </ChartCard>
  );
}

interface WeekRow {
  key: string;
  label: string;
  title: string;
  minutes: number;
}

function TimePerWeek({ rows }: { rows: WeekRow[] }) {
  const t = useChartTheme();
  const total = rows.reduce((s, r) => s + r.minutes, 0);
  return (
    <ChartCard
      title="Time practiced per week"
      description={
        <>
          <span className="font-semibold text-text">{fmtMinutes(total * 60_000)}</span> across {rows.length} weeks
        </>
      }
      rows={[...rows].reverse()}
      columns={[
        { key: 'w', header: 'Week of', cell: (r) => r.title },
        { key: 'm', header: 'Minutes', cell: (r) => r.minutes, align: 'right' },
      ]}
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={6}>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} tick={{ fill: t.faint, fontSize: 11 }} axisLine={{ stroke: t.grid }} tickLine={false} />
            <YAxis allowDecimals={false} width={36} tick={{ fill: t.faint, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.5 }}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as WeekRow | undefined;
                if (!active || !r) return null;
                return <TooltipBox title={`Week of ${r.title}`} rows={[{ key: 'm', value: fmtMinutes(r.minutes * 60_000), label: 'practiced' }]} />;
              }}
            />
            <Bar dataKey="minutes" fill={t.c1} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

type AreaRow = DashboardDTO['areas'][number];

function SmallAreaBars({ areas, dataKey, title }: { areas: AreaRow[]; dataKey: 'mastery' | 'confidence'; title: string }) {
  const t = useChartTheme();
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">{title}</h4>
      <div style={{ height: areas.length * 30 + 24 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={areas} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke={t.grid} />
            <XAxis type="number" domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={pct} tick={{ fill: t.faint, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={96} tick={{ fill: t.muted, fontSize: 11 }} axisLine={{ stroke: t.grid }} tickLine={false} />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.5 }}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as AreaRow | undefined;
                if (!active || !r) return null;
                return <TooltipBox title={r.name} rows={[{ key: 'v', value: pct(r[dataKey]), label: dataKey }]} />;
              }}
            />
            <Bar dataKey={dataKey} fill={t.c1} barSize={12} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList dataKey={dataKey} position="right" formatter={(v: unknown) => pct(Number(v))} fill={t.muted} fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ConfidenceVsMastery({ areas }: { areas: AreaRow[] }) {
  return (
    <ChartCard
      title="Mastery and confidence by area"
      description="Shown side by side. Confidence is how much evidence backs the mastery estimate."
      rows={areas}
      columns={[
        { key: 'a', header: 'Area', cell: (r) => r.name },
        { key: 'm', header: 'Mastery', cell: (r) => pct(r.mastery), align: 'right' },
        { key: 'c', header: 'Confidence', cell: (r) => pct(r.confidence), align: 'right' },
        { key: 'g', header: 'Gap', cell: (r) => `${Math.round((r.mastery - r.confidence) * 100)} pts`, align: 'right' },
      ]}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SmallAreaBars areas={areas} dataKey="mastery" title="Mastery" />
        <SmallAreaBars areas={areas} dataKey="confidence" title="Confidence" />
      </div>
    </ChartCard>
  );
}

function StatusBreakdown({ concepts }: { concepts: ConceptStateDTO[] }) {
  const [hover, setHover] = useState<Status | null>(null);
  const total = concepts.length;
  const rows = STATUS_ORDER.map((s) => ({ ...s, count: concepts.filter((c) => c.status === s.key).length }));
  const h = rows.find((r) => r.key === hover);
  return (
    <ChartCard
      title="Concept status"
      description={`${total} concepts in the taxonomy, by current state.`}
      rows={rows}
      columns={[
        { key: 's', header: 'Status', cell: (r) => r.label },
        { key: 'n', header: 'Concepts', cell: (r) => r.count, align: 'right' },
        { key: 'p', header: 'Share', cell: (r) => (total ? pct(r.count / total) : '0%'), align: 'right' },
      ]}
    >
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" data-testid="status-legend">
        {rows.map((r) => (
          <span key={r.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] border border-border" style={{ background: `var(--heat-${r.heat})` }} />
            <r.icon className="size-3.5" /> {r.label}
            <span className="font-semibold tabular-nums text-text">{r.count}</span>
          </span>
        ))}
      </div>
      <div className="relative" onPointerLeave={() => setHover(null)}>
        <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label={rows.map((r) => `${r.label}: ${r.count}`).join(', ')}>
          {total > 0 &&
            rows.map((r) =>
              r.count ? (
                <div
                  key={r.key}
                  onPointerEnter={() => setHover(r.key)}
                  className={cn('flex min-w-0 items-center justify-center text-xs font-semibold tabular-nums transition-opacity', hover && hover !== r.key && 'opacity-60')}
                  style={{ width: `${(r.count / total) * 100}%`, background: `var(--heat-${r.heat})`, color: `var(--heat-fg-${r.heat})` }}
                >
                  {r.count / total >= 0.06 && r.count}
                </div>
              ) : null,
            )}
        </div>
        {h && (
          <div className="absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2">
            <TooltipBox
              title={h.label}
              rows={[
                { key: 'n', value: h.count, label: h.count === 1 ? 'concept' : 'concepts', swatch: 'none' },
                { key: 'p', value: total ? pct(h.count / total) : '0%', label: 'of all concepts', swatch: 'none' },
              ]}
            />
          </div>
        )}
      </div>
    </ChartCard>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */

export function AnalyticsPage() {
  const [range, setRange] = useState<RangeId>('30');
  const dashQ = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, retry: false });
  const sessionsQ = useQuery({ queryKey: ['sessions'], queryFn: api.sessions, retry: false });
  const conceptsQ = useQuery({ queryKey: ['concepts'], queryFn: api.concepts, retry: false });

  const dash = dashQ.data;
  const allSessions = sessionsQ.data;
  const concepts = conceptsQ.data;
  const failed = [dashQ, sessionsQ, conceptsQ].find((x) => x.isError);

  const days = RANGES.find((r) => r.id === range)!.days;
  const cutoff = Number.isFinite(days) ? startOfDay(Date.now()) - (days - 1) * DAY : -Infinity;

  const view = useMemo(() => {
    if (!dash || !allSessions || !concepts) return null;
    const sessions = allSessions.filter((s) => s.startedAt >= cutoff);
    const cutoffKey = Number.isFinite(cutoff) ? dayKey(cutoff) : '';
    const trend = dash.trend.filter((d) => d.day >= cutoffKey);
    const results = buildBuckets(sessions, days);

    const answers = sessions.reduce((s, x) => s + graded(x), 0);
    const correct = sessions.reduce((s, x) => s + x.results.correct, 0);
    const totalMs = sessions.reduce((s, x) => s + sessionMs(x), 0);

    const byMode = new Map<SessionMode, ModeRow>();
    for (const s of sessions) {
      const r = byMode.get(s.mode) ?? { mode: s.mode, name: MODES[s.mode].name, accuracy: 0, correct: 0, answers: 0 };
      r.correct += s.results.correct;
      r.answers += graded(s);
      byMode.set(s.mode, r);
    }
    const modeRows = [...byMode.values()]
      .filter((r) => r.answers > 0)
      .map((r) => ({ ...r, accuracy: r.correct / r.answers }))
      .sort((a, b) => b.accuracy - a.accuracy);

    // Weekly time, weeks ending with the current week.
    const thisWeek = startOfDay(Date.now()) - ((new Date().getDay() + 6) % 7) * DAY; // Monday
    const earliest = sessions.length ? Math.min(...sessions.map((s) => s.startedAt)) : Date.now();
    const spanDays = Number.isFinite(days) ? days : Math.max(7, Math.ceil((Date.now() - earliest) / DAY) + 1);
    const nWeeks = Math.max(1, Math.ceil(spanDays / 7));
    const weeks: WeekRow[] = Array.from({ length: nWeeks }, (_, i) => {
      const start = thisWeek - (nWeeks - 1 - i) * 7 * DAY;
      const d = new Date(start);
      return { key: String(start), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), title: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), minutes: 0 };
    });
    const firstWeek = thisWeek - (nWeeks - 1) * 7 * DAY;
    for (const s of sessions) {
      const w = weeks[Math.floor((startOfDay(s.startedAt) - firstWeek) / (7 * DAY))];
      if (w) w.minutes += Math.round(sessionMs(s) / 60_000);
    }

    return {
      sessions,
      trend,
      results,
      answers,
      correct,
      totalMs,
      modeRows,
      weeks,
      assessed: concepts.filter((c) => c.status !== 'unknown').length,
    };
  }, [dash, allSessions, concepts, cutoff, days]);

  const header = (
    <PageHeader
      title="Analytics"
      description="How your practice and skill model change over time."
    />
  );

  if (failed) return <LoadError error={failed.error} onRetry={() => void failed.refetch()} />;

  if (!view || !dash || !concepts) {
    return (
      <>
        {header}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {header}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Date range" className="flex rounded-lg border border-border bg-surface-2 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              role="radio"
              aria-checked={range === r.id}
              onClick={() => setRange(r.id)}
              className={cn('h-8 rounded-md px-3 text-xs font-medium text-muted hover:text-text', range === r.id && 'bg-surface text-text shadow-card')}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi icon={Clock} label="Time practiced" value={fmtMinutes(view.totalMs)} sub={`${view.sessions.length} sessions`} />
          <Kpi icon={ListChecks} label="Answers" value={view.answers} sub="graded" />
          <Kpi icon={Target} label="Accuracy" value={view.answers ? pct(view.correct / view.answers) : '—'} sub={`${view.correct} correct`} />
          <Kpi icon={Network} label="Concepts assessed" value={`${view.assessed} / ${concepts.length}`} sub="current, all time" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <CalibrationChart calibration={dash.calibration} />
          </div>
          <div className="min-w-0">
            <RetentionCard retention={dash.retention} confidentErrors={dash.calibration.confidentErrors} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <MasteryTrend trend={view.trend} />
          </div>
          <div className="min-w-0">
            <ResultsChart buckets={view.results.buckets} unit={view.results.unit} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <AccuracyByMode rows={view.modeRows} />
          </div>
          <div className="min-w-0">
            <TimePerWeek rows={view.weeks} />
          </div>
        </div>

        <ConfidenceVsMastery areas={dash.areas} />
        <StatusBreakdown concepts={concepts} />
      </div>
    </>
  );
}
