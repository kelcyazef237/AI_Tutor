import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, CircleDot, Clock, CornerDownRight, Eye, History as HistoryIcon, ListChecks, Target, Timer, UserCheck, X, XCircle, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MODES, QUESTION_TYPE_LABEL, REFLECTION_PROMPTS, SESSION_MODES, confidenceLabel, difficultyName, type AttemptDTO, type Result, type SessionMode, type SessionSummaryDTO } from '@psc/shared';
import { ResultsChart } from '@/components/charts/ResultsChart';
import { buildBuckets } from '@/lib/buckets';
import { PageHeader } from '@/components/layout/PageHeader';
import { Markdown } from '@/components/Markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { MODE_ICON } from '@/lib/modeIcons';
import { LoadError } from '@/components/ui/load-error';
import { cn } from '@/lib/utils';

const DAY = 86_400_000;
const RANGES = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: Infinity },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const RESULT: Record<Result, { icon: LucideIcon; label: string; tone: 'accent' | 'warning' | 'danger'; bar: string }> = {
  correct: { icon: CheckCircle2, label: 'Correct', tone: 'accent', bar: 'bg-success' },
  partial: { icon: CircleDot, label: 'Partial', tone: 'warning', bar: 'bg-warning' },
  incorrect: { icon: XCircle, label: 'Incorrect', tone: 'danger', bar: 'bg-danger' },
};

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDur = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
function fmtDayHeading(ts: number) {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
const pts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))} pts`;

/* ── Pieces ─────────────────────────────────────────────────── */

function StatTile({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </Card>
  );
}

function ResultBar({ results, total }: { results: Record<Result, number>; total: number }) {
  const answered = results.correct + results.partial + results.incorrect;
  return (
    <div className="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full bg-surface-2" title={`${results.correct} correct · ${results.partial} partial · ${results.incorrect} incorrect`}>
      {(['correct', 'partial', 'incorrect'] as const).map((k) =>
        results[k] ? <div key={k} className={RESULT[k].bar} style={{ width: `${(results[k] / Math.max(total, answered)) * 100}%` }} /> : null,
      )}
    </div>
  );
}

function AttemptList({ session, onOpen }: { session: SessionSummaryDTO; onOpen: (a: AttemptDTO) => void }) {
  const q = useQuery({
    queryKey: ['attempts', session.id],
    queryFn: () => api.sessionAttempts(session.id),
  });
  if (q.isLoading) return <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (q.isError) return <p className="p-4 text-sm text-danger">{(q.error as Error).message}</p>;
  if (!q.data?.length) return <p className="p-4 text-sm text-faint">No graded answers in this session.</p>;
  return (
    <ul className="divide-y divide-border">
      {q.data.map((a) => {
        const R = a.result ? RESULT[a.result] : null;
        const delta = a.masteryBefore != null && a.masteryAfter != null ? (a.masteryAfter - a.masteryBefore) / 7 : null;
        return (
          <li key={a.id}>
            <button onClick={() => onOpen(a)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2 sm:px-5">
              {a.isFollowUp && <CornerDownRight className="size-3.5 shrink-0 text-faint" aria-label="Follow-up" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{a.conceptName}</div>
                <div className="truncate text-xs text-faint">
                  {QUESTION_TYPE_LABEL[a.type]} · {difficultyName(a.difficulty).toLowerCase()}
                  {a.selfGraded && ' · self-graded'}
                  {a.durationMs != null && ` · ${Math.max(1, Math.round(a.durationMs / 60_000))} min`}
                </div>
              </div>
              {delta != null && <span className={cn('hidden w-16 text-right text-xs tabular-nums sm:block', delta >= 0 ? 'text-success' : 'text-danger')}>{pts(delta)}</span>}
              {R && (
                <Badge tone={R.tone} className="w-24 justify-center">
                  <R.icon className="size-3" /> {R.label}
                </Badge>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SessionRow({ s, open, onToggle, onOpenAttempt }: { s: SessionSummaryDTO; open: boolean; onToggle: () => void; onOpenAttempt: (a: AttemptDTO) => void }) {
  const Icon = MODE_ICON[s.mode];
  const answered = s.results.correct + s.results.partial + s.results.incorrect;
  const accuracy = answered ? Math.round((s.results.correct / answered) * 100) : null;
  return (
    <li>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 sm:px-5">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
          <Icon className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{MODES[s.mode].name}</span>
            {!s.endedAt && <Badge tone="warning">Unfinished</Badge>}
          </div>
          <div className="truncate text-xs text-faint">
            {fmtTime(s.startedAt)}
            {s.endedAt && ` · ${fmtDur(s.endedAt - s.startedAt)}`}
            {s.concepts.length > 0 && ` · ${s.concepts.join(', ')}`}
          </div>
        </div>
        <div className="hidden w-40 shrink-0 md:block">
          <div className="mb-1 flex justify-between text-xs tabular-nums text-muted">
            <span>
              {s.answered}/{s.total}
            </span>
            <span>{accuracy != null ? `${accuracy}% correct` : '—'}</span>
          </div>
          <ResultBar results={s.results} total={s.total} />
        </div>
        <span className={cn('w-16 shrink-0 text-right text-xs font-medium tabular-nums', s.masteryChange >= 0 ? 'text-success' : 'text-danger')} title="Total mastery change">
          {pts(s.masteryChange)}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-border bg-bg/50">
          <AttemptList session={s} onOpen={onOpenAttempt} />
          {s.reflection && (
            <div className="border-t border-border px-5 py-4" data-testid="history-reflection">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Your reflection</h4>
              <dl className="space-y-2 text-sm">
                {REFLECTION_PROMPTS.filter((p) => s.reflection![p.key]).map((p) => (
                  <div key={p.key}>
                    <dt className="text-xs text-muted">{p.label}</dt>
                    <dd className="whitespace-pre-wrap">{s.reflection![p.key]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function AttemptDialog({ a, onClose }: { a: AttemptDTO | null; onClose: () => void }) {
  const R = a?.result ? RESULT[a.result] : null;
  return (
    <Dialog.Root open={!!a} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-surface shadow-2xl outline-none">
          {a && (
            <>
              <div className="flex items-start gap-3 border-b border-border p-5">
                <div className="min-w-0 flex-1">
                  <Dialog.Description className="text-xs text-faint">
                    {QUESTION_TYPE_LABEL[a.type]} · {difficultyName(a.difficulty).toLowerCase()} · {new Date(a.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </Dialog.Description>
                  <Dialog.Title className="mt-0.5 text-lg font-semibold">
                    <Link to={`/skills?c=${a.conceptId}`} className="hover:text-accent" onClick={onClose}>
                      {a.conceptName}
                    </Link>
                  </Dialog.Title>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {R && (
                      <Badge tone={R.tone}>
                        <R.icon className="size-3" /> {R.label}
                        {a.score != null && ` · ${Math.round(a.score * 100)}%`}
                      </Badge>
                    )}
                    {a.isFollowUp && (
                      <Badge>
                        <CornerDownRight className="size-3" /> Follow-up
                      </Badge>
                    )}
                    {a.selfGraded && (
                      <Badge>
                        <UserCheck className="size-3" /> Self-graded
                      </Badge>
                    )}
                    {confidenceLabel(a.predicted) && (
                      <Badge tone={a.predicted! >= 3 && a.result === 'incorrect' ? 'warning' : 'neutral'} title="Confidence you stated before feedback">
                        You said: {confidenceLabel(a.predicted)}
                      </Badge>
                    )}
                    {a.masteryBefore != null && a.masteryAfter != null && (
                      <Badge>
                        Mastery {Math.round((a.masteryBefore / 7) * 100)}% → {Math.round((a.masteryAfter / 7) * 100)}%
                      </Badge>
                    )}
                  </div>
                </div>
                <Dialog.Close asChild>
                  <Button variant="ghost" size="icon" aria-label="Close">
                    <X />
                  </Button>
                </Dialog.Close>
              </div>
              <div className="space-y-5 overflow-y-auto p-5">
                <section>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">Question</h4>
                  <Markdown>{a.prompt}</Markdown>
                </section>
                <section>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">Your answer</h4>
                  <div className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{a.answer || <span className="text-faint">No answer</span>}</div>
                </section>
                <section>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">Feedback</h4>
                  {a.feedback ? <Markdown>{a.feedback}</Markdown> : <p className="text-sm text-faint">No feedback recorded.</p>}
                </section>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ── Page ───────────────────────────────────────────────────── */

export function HistoryPage() {
  const q = useQuery({ queryKey: ['sessions'], queryFn: api.sessions, retry: false });
  const [range, setRange] = useState<RangeId>('30');
  const [mode, setMode] = useState<'all' | SessionMode>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<AttemptDTO | null>(null);

  const all = q.data;
  const days = RANGES.find((r) => r.id === range)!.days;

  const sessions = useMemo(() => {
    const cutoff = Number.isFinite(days) ? startOfDay(Date.now()) - (days - 1) * DAY : -Infinity;
    return (all ?? []).filter((s) => s.startedAt >= cutoff && (mode === 'all' || s.mode === mode));
  }, [all, days, mode]);

  const chart = useMemo(() => buildBuckets(sessions, days), [sessions, days]);
  const groups = useMemo(() => {
    const m = new Map<string, SessionSummaryDTO[]>();
    for (const s of sessions) m.set(dayKey(s.startedAt), [...(m.get(dayKey(s.startedAt)) ?? []), s]);
    return [...m.values()];
  }, [sessions]);

  const header = (
    <PageHeader
      title="History"
      description="Every session and graded answer. Open a session to see each question, your answer and the feedback."
    />
  );

  if (q.isError) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;

  if (!all) {
    return (
      <>
        {header}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="mt-6 h-72 rounded-xl" />
      </>
    );
  }

  const tot = sessions.reduce(
    (acc, s) => {
      acc.correct += s.results.correct;
      acc.partial += s.results.partial;
      acc.incorrect += s.results.incorrect;
      acc.ms += s.endedAt ? s.endedAt - s.startedAt : 0;
      acc.change += s.masteryChange;
      return acc;
    },
    { correct: 0, partial: 0, incorrect: 0, ms: 0, change: 0 },
  );
  const answered = tot.correct + tot.partial + tot.incorrect;

  return (
    <>
      {header}

      {/* Filters: one row, date range first */}
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
        <Select value={mode} onChange={(e) => setMode(e.target.value as 'all' | SessionMode)} className="w-auto" aria-label="Mode">
          <option value="all">All modes</option>
          {SESSION_MODES.map((m) => (
            <option key={m} value={m}>
              {MODES[m].name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile icon={HistoryIcon} label="Sessions" value={sessions.length} sub={`${sessions.filter((s) => !s.endedAt).length} unfinished`} />
        <StatTile icon={ListChecks} label="Answers graded" value={answered} sub={`${tot.partial} partial · ${tot.incorrect} incorrect`} />
        <StatTile icon={Target} label="Correct" value={answered ? `${Math.round((tot.correct / answered) * 100)}%` : '—'} sub={`Mastery ${pts(tot.change)} in total`} />
        <StatTile icon={Timer} label="Time practiced" value={fmtDur(tot.ms)} sub="Finished sessions only" />
      </div>

      <div className="mt-6">
        <ResultsChart buckets={chart.buckets} unit={chart.unit} />
      </div>

      <div className="mt-6 space-y-6">
        {groups.length === 0 ? (
          <Card>
            <EmptyState
              icon={Clock}
              title="No sessions in this range"
              action={
                <Link to="/train">
                  <Button>Start a session</Button>
                </Link>
              }
            >
              Try a longer date range or a different mode.
            </EmptyState>
          </Card>
        ) : (
          groups.map((items) => (
            <section key={items[0]!.id}>
              <h3 className="mb-2 text-sm font-semibold text-muted">{fmtDayHeading(items[0]!.startedAt)}</h3>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {items.map((s) => (
                    <SessionRow key={s.id} s={s} open={openId === s.id} onToggle={() => setOpenId((o) => (o === s.id ? null : s.id))} onOpenAttempt={setAttempt} />
                  ))}
                </ul>
              </Card>
            </section>
          ))
        )}
      </div>

      <AttemptDialog a={attempt} onClose={() => setAttempt(null)} />
    </>
  );
}
