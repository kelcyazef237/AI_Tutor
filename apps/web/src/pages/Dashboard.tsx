import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Eye, Flame, Hourglass, Sparkles, Target, TrendingUp, XCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MODES, QUESTION_TYPE_LABEL, difficultyName, type DashboardDTO } from '@psc/shared';
import { ActivityHeatmap } from '@/components/charts/ActivityHeatmap';
import { DomainBars } from '@/components/charts/DomainBars';
import { MasteryTrend } from '@/components/charts/MasteryTrend';
import { ReviewForecast } from '@/components/charts/ReviewForecast';
import { pct } from '@/components/charts/Tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { LoadError } from '@/components/ui/load-error';
import { cn } from '@/lib/utils';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function relTime(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

/* ── Stat tiles ─────────────────────────────────────────────── */

function StatTile({ icon: Icon, label, value, sub, meter }: { icon: LucideIcon; label: string; value: ReactNode; sub?: ReactNode; meter?: number }) {
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted sm:gap-2 sm:text-sm">
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums sm:mt-2 sm:text-2xl">{value}</div>
      {meter !== undefined && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-accent-soft" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meter * 100)} aria-label={label}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.min(100, meter * 100)}%` }} />
        </div>
      )}
      {sub && <div className="mt-2 text-xs text-faint">{sub}</div>}
    </Card>
  );
}

/* ── Lists ──────────────────────────────────────────────────── */

function ConceptRow({ name, domain, value, right }: { name: string; domain: string; value: number; right: ReactNode }) {
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-faint">{domain}</div>
        </div>
        <div className="shrink-0 text-sm tabular-nums">{right}</div>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-accent-soft">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
    </li>
  );
}

function ListCard({ title, description, icon: Icon, children, empty }: { title: string; description: string; icon: LucideIcon; children: ReactNode; empty: boolean }) {
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Icon className="size-4 text-muted" />{title}</span>} description={description} />
      <CardBody className="pt-2">{empty ? <p className="py-6 text-center text-sm text-faint">Nothing here yet.</p> : <ul className="divide-y divide-border">{children}</ul>}</CardBody>
    </Card>
  );
}

const RESULT: Record<'correct' | 'partial' | 'incorrect', { icon: LucideIcon; label: string; tone: 'accent' | 'warning' | 'danger' }> = {
  correct: { icon: CheckCircle2, label: 'Correct', tone: 'accent' },
  partial: { icon: CircleDot, label: 'Partial', tone: 'warning' },
  incorrect: { icon: XCircle, label: 'Incorrect', tone: 'danger' },
};

/* ── Page ───────────────────────────────────────────────────── */

export function Dashboard() {
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: api.settings, retry: false });
  const q = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, retry: false });

  const data: DashboardDTO | undefined = q.data;

  if (q.isError) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;
  const name = settingsQ.data?.learnerName;

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-80 rounded-xl" />)}</div>
      </div>
    );
  }

  const s = data.stats;
  const rec = data.recommendation;

  return (
    <div className={cn('space-y-6 transition-opacity', q.isFetching && q.data && 'opacity-60')}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            {greeting()}
            {name ? `, ${name}` : ''}
          </h2>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon={Flame} label="Streak" value={`${s.streak} ${s.streak === 1 ? 'day' : 'days'}`} sub={`Longest: ${s.longestStreak} days`} />
        <StatTile icon={Target} label="Today" value={`${s.today} / ${s.dailyGoal}`} meter={s.today / s.dailyGoal} sub={s.today >= s.dailyGoal ? 'Daily goal met' : `${s.dailyGoal - s.today} to go`} />
        <StatTile icon={TrendingUp} label="This week" value={`${s.week} / ${s.weeklyGoal}`} meter={s.week / s.weeklyGoal} sub={`${s.conceptsAssessed} of ${s.totalConcepts} concepts assessed`} />
        <StatTile
          icon={Hourglass}
          label="Due for review"
          value={s.dueNow}
          sub={
            data.overdue > 0 ? (
              <span className="inline-flex items-center gap-1 text-warning">
                <AlertTriangle className="size-3" /> {data.overdue} overdue
              </span>
            ) : (
              'Nothing overdue'
            )
          }
        />
      </div>

      {/* Recommendation */}
      <Card className="overflow-hidden border-accent/30 bg-gradient-to-br from-accent-soft/70 to-surface">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg">
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wider text-accent">Recommended next session</div>
            <div className="mt-0.5 text-lg font-semibold">{rec.title}</div>
            <p className="text-sm text-muted">{rec.reason}</p>
            {rec.concepts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {rec.concepts.map((c) => (
                  <Badge key={c} className="bg-surface">
                    {c}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <Link to={`/train?mode=${rec.mode}`} className="shrink-0">
            <Button size="lg" className="w-full sm:w-auto">
              Start {MODES[rec.mode].name.replace(' Session', '')} <ArrowRight />
            </Button>
          </Link>
        </div>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MasteryTrend trend={data.trend} />
        <DomainBars areas={data.areas} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ActivityHeatmap activity={data.activity} dailyGoal={s.dailyGoal} className="xl:col-span-2" />
        <ReviewForecast forecast={data.forecast} overdue={data.overdue} />
      </div>

      {/* Concept lists */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ListCard title="Weakest concepts" description="Lowest mastery among assessed concepts." icon={Target} empty={!data.weakest.length}>
          {data.weakest.map((c) => (
            <ConceptRow key={c.conceptId} name={c.name} domain={c.domainName} value={c.mastery} right={pct(c.mastery)} />
          ))}
        </ListCard>
        <ListCard title="Improving" description="Largest gains over the last 14 days." icon={TrendingUp} empty={!data.improving.length}>
          {data.improving.map((c) => (
            <ConceptRow key={c.conceptId} name={c.name} domain={c.domainName} value={c.mastery} right={<span className="text-success">+{Math.round(c.delta * 100)} pts</span>} />
          ))}
        </ListCard>
        <ListCard title="At risk of decay" description="Once-solid concepts now overdue for review." icon={Hourglass} empty={!data.atRisk.length}>
          {data.atRisk.map((c) => (
            <ConceptRow key={c.conceptId} name={c.name} domain={c.domainName} value={c.mastery} right={<span className="text-warning">{c.overdueDays}d overdue</span>} />
          ))}
        </ListCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recurring misconceptions" description={`${s.activeMisconceptions} active. They get tested again, indirectly.`} />
          <CardBody className="pt-2">
            {data.misconceptions.length ? (
              <ul className="divide-y divide-border">
                {data.misconceptions.map((m) => (
                  <li key={m.id} className="flex gap-3 py-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{m.text}</p>
                      <p className="mt-1 text-xs text-faint">
                        {m.conceptName} · seen {m.occurrences}× · {relTime(m.lastSeen)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-faint">No recorded misconceptions.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent assessments" description="Your latest graded answers." />
          <CardBody className="pt-2">
            {data.recent.length ? (
              <ul className="divide-y divide-border">
                {data.recent.map((a) => {
                  const r = RESULT[a.result];
                  return (
                    <li key={a.attemptId} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{a.conceptName}</div>
                        <div className="truncate text-xs text-faint">
                          {QUESTION_TYPE_LABEL[a.type]} · {difficultyName(a.difficulty).toLowerCase()} · {relTime(a.at)}
                        </div>
                      </div>
                      <Badge tone={r.tone}>
                        <r.icon className="size-3" /> {r.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-faint">No assessments yet.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
