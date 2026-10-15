import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Flag,
  Lightbulb,
  Loader2,
  Network,
  NotebookPen,
  Play,
  RotateCcw,
  Route,
  ShieldCheck,
  Terminal,
  Timer,
  Trash2,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AREAS,
  DOMAINS,
  SIM_LOOP,
  SIM_PHASE_LABEL,
  SIM_PHASES,
  difficultyName,
  type SimDebrief,
  type SimulationDTO,
  type SimTranscriptEntry,
} from '@psc/shared';
import { ChartCard } from '@/components/charts/ChartCard';
import { useAIStatus } from '@/components/layout/AIStatusPill';
import { PageHeader } from '@/components/layout/PageHeader';
import { Markdown } from '@/components/Markdown';
import { ThinkingDots } from '@/components/session/AnswerBox';
import { AttackGraph } from '@/components/simulation/AttackGraph';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Label, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { clock, relative } from '@/lib/format';
import { cn } from '@/lib/utils';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function focusName(focus: string) {
  return DOMAINS.find((d) => d.id === focus)?.name ?? AREAS.find((a) => a.id === focus)?.name ?? 'Mixed';
}

function aiErrorTitle(e: unknown) {
  if (e instanceof ApiError && e.kind === 'quota') return 'AI quota reached';
  if (e instanceof ApiError && e.kind) return 'The simulator is unavailable';
  return 'Something went wrong';
}

function ErrorBanner({ error, onRetry, children }: { error: unknown; onRetry?: () => void; children?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm sm:flex-row sm:items-center">
      <AlertTriangle className="size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{aiErrorTitle(error)}</p>
        <p className="text-muted">
          {(error as Error).message} {children}
        </p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCcw /> Retry
        </Button>
      )}
    </div>
  );
}

/* ── Lobby ──────────────────────────────────────────────────────── */

export function SimulationLobby() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ai = useAIStatus();
  const list = useQuery({ queryKey: ['simulations'], queryFn: api.simulations, retry: false });
  const [focus, setFocus] = useState('');
  const [difficulty, setDifficulty] = useState(3);

  const start = useMutation({
    mutationFn: () => api.startSimulation({ focus, difficulty }),
    onSuccess: (sim) => {
      qc.invalidateQueries({ queryKey: ['simulations'] });
      qc.setQueryData(['simulation', sim.id], sim);
      navigate(`/simulation/${sim.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteSimulation(id),
    onSuccess: () => {
      toast.success('Engagement deleted');
      qc.invalidateQueries({ queryKey: ['simulations'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const aiDown = ai.data && !ai.data.ok;

  return (
    <>
      <PageHeader title="Pentest Simulation" description="A simulated engagement in an authorized lab. You decide, the target responds, and your reasoning is scored." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="New engagement" description="The simulator builds a hidden lab environment. You only see what your actions uncover." />
          <CardBody className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="sim-focus" hint="Area or domain the engagement should exercise">
                Focus
              </Label>
              <Select id="sim-focus" value={focus} onChange={(e) => setFocus(e.target.value)}>
                <option value="">Mixed (network, web and host)</option>
                <optgroup label="Areas">
                  {AREAS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Domains">
                  {DOMAINS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </div>
            <div className="space-y-2">
              <Label hint="Harder engagements have longer chains and subtler evidence">Difficulty</Label>
              <div role="radiogroup" aria-label="Difficulty" className="grid grid-cols-5 gap-1 rounded-lg border border-border bg-surface-2 p-1">
                {[1, 2, 3, 4, 5].map((d) => (
                  <button
                    key={d}
                    role="radio"
                    aria-checked={difficulty === d}
                    onClick={() => setDifficulty(d)}
                    className={cn('rounded-md px-1 py-1.5 text-xs font-medium text-muted hover:text-text', difficulty === d && 'bg-surface text-text shadow-card')}
                  >
                    <span className="hidden sm:inline">{difficultyName(d).charAt(0) + difficultyName(d).slice(1).toLowerCase()}</span>
                    <span className="sm:hidden">{d}</span>
                  </button>
                ))}
              </div>
            </div>
            {start.isError && <ErrorBanner error={start.error} onRetry={() => start.mutate()} />}
            {aiDown && !start.isError && (
              <p className="flex items-center gap-2 text-sm text-warning">
                <AlertTriangle className="size-4" /> The AI provider is reporting a problem. Simulations need a working model.
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" onClick={() => start.mutate()} disabled={start.isPending}>
                {start.isPending ? <Loader2 className="animate-spin" /> : <Play />}
                {start.isPending ? 'Building the lab…' : 'Start engagement'}
              </Button>
              {start.isPending && <p className="text-sm text-muted">Designing hosts, services and an attack chain. This can take a minute.</p>}
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="How it works" />
          <CardBody>
            <ol className="space-y-3 text-sm text-muted">
              {[
                'Read the briefing: scope, attacker model, credentials.',
                'Describe each action and why you are taking it. Vague actions get vague results.',
                'Work the loop: observation → hypothesis → test → evidence → conclusion.',
                'End the engagement for a debrief scored by phase and reasoning quality.',
              ].map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Engagements" description="Resume an active engagement or review a debrief." />
        <CardBody className="p-0 pt-3">
          {list.isLoading ? (
            <div className="space-y-2 p-5">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : list.isError ? (
            <EmptyState icon={AlertTriangle} title="Couldn't load engagements">
              {(list.error as Error).message}
            </EmptyState>
          ) : !list.data?.length ? (
            <EmptyState icon={Route} title="No engagements yet">
              Start one above. Your first engagement is a good way to see how you reason under uncertainty.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {list.data.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <Link to={`/simulation/${s.id}`} className="min-w-0 flex-1 hover:text-accent">
                    <div className="truncate text-sm font-medium">{s.title}</div>
                    <div className="truncate text-xs text-faint">
                      {focusName(s.focus)} · {difficultyName(s.difficulty).toLowerCase()} · {s.actions} action{s.actions === 1 ? '' : 's'} · {relative(s.startedAt)}
                    </div>
                  </Link>
                  {s.status === 'active' ? (
                    <Badge tone="accent">Active · {SIM_PHASE_LABEL[s.phase]}</Badge>
                  ) : s.overall != null ? (
                    <Badge>Score {pct(s.overall)}</Badge>
                  ) : (
                    <Badge tone="warning">No debrief</Badge>
                  )}
                  <Button variant="ghost" size="icon" aria-label={`Delete ${s.title}`} disabled={remove.isPending} onClick={() => remove.mutate(s.id)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}

/* ── Engagement pieces ──────────────────────────────────────────── */

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Countdown({ sim }: { sim: SimulationDTO }) {
  const now = useNow(sim.status === 'active');
  const elapsed = (sim.endedAt ?? now) - sim.startedAt;
  const left = sim.timeLimitMinutes * 60_000 - elapsed;
  const over = left < 0;
  return (
    <div className={cn('flex items-center gap-1.5 text-sm tabular-nums', over ? 'text-warning' : 'text-muted')} aria-label={over ? 'Time over' : 'Time remaining'} title={`Time box: ${sim.timeLimitMinutes} minutes`}>
      <Timer className="size-4" />
      {sim.status === 'ended' ? clock(elapsed) : over ? `+${clock(-left)} over` : clock(left)}
    </div>
  );
}

export function PhaseTracker({ sim }: { sim: SimulationDTO }) {
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Engagement phases">
      {SIM_PHASES.map((p, i) => {
        const reached = sim.phasesReached.includes(p);
        const current = sim.phase === p && sim.status === 'active';
        return (
          <li key={p} className="min-w-[88px] flex-1" aria-current={current ? 'step' : undefined}>
            <div className={cn('h-1.5 rounded-full', reached ? 'bg-accent' : 'bg-surface-2', current && 'ring-2 ring-[var(--ring)]')} />
            <div className={cn('mt-1.5 flex items-center gap-1 text-[11px]', current ? 'font-semibold text-text' : reached ? 'text-muted' : 'text-faint')}>
              <span className="tabular-nums text-faint">{i + 1}</span> {SIM_PHASE_LABEL[p]}
              {reached && !current && <span className="sr-only">(reached)</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** O→H→T→E→C meter: share of actions in which each stage was present. */
export function LoopMeter({ loop, actions }: { loop: SimulationDTO['loop']; actions: number }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {SIM_LOOP.map((s, i) => (
          <div key={s.key} className="min-w-0 text-center" title={`${s.label}: present in ${pct(loop[s.key])} of your actions`}>
            <div className="relative mx-auto flex h-16 w-full max-w-10 items-end overflow-hidden rounded-md bg-surface-2">
              <div className="w-full rounded-t-[4px] bg-accent transition-[height] duration-500" style={{ height: `${Math.max(loop[s.key] > 0 ? 6 : 0, loop[s.key] * 100)}%` }} />
            </div>
            <div className="mt-1 text-xs font-semibold">
              {s.short}
              {i < SIM_LOOP.length - 1 && <span className="sr-only"> then</span>}
            </div>
            <div className="truncate text-[11px] text-faint">{actions ? pct(loop[s.key]) : '–'}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-faint">
        {SIM_LOOP.map((s) => s.label).join(' → ')}. Share of your {actions} action{actions === 1 ? '' : 's'} showing each stage.
      </p>
    </div>
  );
}

function StageChips({ entry }: { entry: SimTranscriptEntry }) {
  if (!entry.reasoning) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
      {SIM_LOOP.map((s) => {
        const on = entry.reasoning!.stages.includes(s.key);
        return (
          <span key={s.key} title={`${s.label}: ${on ? 'present' : 'missing'}`} className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5', on ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-faint line-through')}>
            {s.short}
          </span>
        );
      })}
      <span className="ml-1">
        Action {pct(entry.reasoning.actionQuality)} · Reasoning {pct(entry.reasoning.reasoningQuality)}
      </span>
      {entry.phase && <span className="ml-auto text-faint">{SIM_PHASE_LABEL[entry.phase]}</span>}
    </div>
  );
}

function Transcript({ sim, pending }: { sim: SimulationDTO; pending: string | null }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [sim.transcript.length, pending]);

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="rounded-lg border border-border bg-surface-2 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-faint">
          <Flag className="size-3.5" /> Briefing
        </div>
        <Markdown>{sim.briefing}</Markdown>
        {!sim.transcript.length && <p className="mt-3 text-sm font-medium">What do you do first?</p>}
      </div>
      {sim.transcript.map((t) =>
        t.role === 'user' ? (
          <div key={t.id} className="flex gap-2 font-mono text-sm">
            <span className="select-none text-accent" aria-hidden>
              $
            </span>
            <p className="min-w-0 whitespace-pre-wrap break-words">
              <span className="sr-only">You: </span>
              {t.content}
            </p>
          </div>
        ) : (
          <div key={t.id} className="rounded-lg border border-border p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-faint">
              <Terminal className="size-3.5" /> Simulated evidence
            </div>
            <Markdown>{t.content}</Markdown>
            {t.mentorNote && (
              <div className="mt-3 flex gap-2 rounded-md bg-accent-soft/50 p-3 text-sm">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" />
                <Markdown className="min-w-0">{t.mentorNote}</Markdown>
              </div>
            )}
            {t.objectiveCompleted && (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-accent">
                <CheckCircle2 className="size-4" /> Objective completed: {t.objectiveCompleted}
              </p>
            )}
            <StageChips entry={t} />
          </div>
        ),
      )}
      {pending && (
        <>
          <div className="flex gap-2 font-mono text-sm opacity-70">
            <span className="text-accent">$</span>
            <p className="min-w-0 whitespace-pre-wrap break-words">{pending}</p>
          </div>
          <p className="flex items-center gap-2 text-sm text-muted" role="status">
            <ThinkingDots className="text-accent" /> The target is responding…
          </p>
        </>
      )}
      <div ref={end} />
    </div>
  );
}

function ActionBox({ onSend, busy }: { onSend: (text: string) => Promise<boolean>; busy: boolean }) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 96), 320)}px`;
  }, [value]);
  const send = async () => {
    if (!value.trim() || busy) return;
    if (await onSend(value.trim())) setValue('');
  };
  return (
    <div>
      <label htmlFor="sim-action" className="mb-2 block text-sm font-medium">
        Your next action
      </label>
      <textarea
        id="sim-action"
        ref={ref}
        value={value}
        maxLength={4000}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="What you observed, what you suspect, and the specific action that would confirm or refute it."
        className="block min-h-24 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 font-mono text-sm leading-relaxed text-text placeholder:font-sans placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-faint">
          <kbd className="rounded border border-border px-1 font-mono">Ctrl</kbd> + <kbd className="rounded border border-border px-1 font-mono">Enter</kbd> to send
        </span>
        <Button onClick={() => void send()} disabled={busy || !value.trim()}>
          {busy ? <ThinkingDots /> : <ArrowRight />} Send action
        </Button>
      </div>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">{title}</h4>
      <ul className="space-y-1.5 text-sm">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-[var(--text-faint)]" />
            <span className="min-w-0">{x}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Horizontal single-hue bars with direct value labels; table twin via ChartCard. */
function ScoreBars({ title, description, rows }: { title: string; description: string; rows: { label: string; value: number; note?: string }[] }) {
  return (
    <ChartCard
      title={title}
      description={description}
      rows={rows}
      columns={[
        { key: 'l', header: 'Item', cell: (r) => r.label },
        { key: 'v', header: 'Score', cell: (r) => pct(r.value), align: 'right' },
      ]}
    >
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} title={`${r.label}: ${pct(r.value)}${r.note ? ` · ${r.note}` : ''}`}>
            <div className="mb-1 flex justify-between gap-3 text-xs">
              <span className="truncate text-muted">{r.label}</span>
              <span className="tabular-nums font-medium text-text">{pct(r.value)}</span>
            </div>
            <div className="h-2 rounded-[4px] bg-surface-2">
              <div className="h-2 rounded-[4px] bg-accent" style={{ width: `${Math.max(2, r.value * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

function Debrief({ sim, d }: { sim: SimulationDTO; d: SimDebrief }) {
  return (
    <div className="space-y-6" data-testid="sim-debrief">
      <Card className="overflow-hidden border-accent/30 bg-gradient-to-br from-accent-soft/70 to-surface">
        <div className="flex flex-col gap-5 p-5 sm:flex-row">
          <div className="shrink-0">
            <div className="text-xs font-medium uppercase tracking-wider text-accent">Overall</div>
            <div className="text-4xl font-semibold tabular-nums tracking-tight">{pct(d.overall)}</div>
            <div className="text-xs text-muted">reasoning-weighted score</div>
          </div>
          <Markdown className="min-w-0 flex-1">{d.summary}</Markdown>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ScoreBars
          title="Phase scores"
          description="How well each phase you reached was handled."
          rows={SIM_PHASES.flatMap((p) => {
            const s = d.phase_scores.find((x) => x.phase === p);
            return s ? [{ label: SIM_PHASE_LABEL[p], value: s.score, note: s.note }] : [];
          })}
        />
        <ScoreBars title="Reasoning loop" description="Quality of each stage across the engagement." rows={SIM_LOOP.map((s) => ({ label: s.label, value: d.reasoning_loop[s.key] }))} />
      </div>
      {(sim.selfDebrief || d.self_assessment_feedback) && (
        <Card data-testid="self-debrief">
          <CardHeader title="Your debrief vs. what happened" description="Calibrating your own read of an engagement is a skill in itself." />
          <CardBody className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <section className="min-w-0">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-faint">
                <NotebookPen className="size-3.5" /> You wrote
              </h4>
              {sim.selfDebrief ? <p className="whitespace-pre-wrap break-words text-sm">{sim.selfDebrief}</p> : <p className="text-sm text-faint">No self-debrief written.</p>}
            </section>
            <section className="min-w-0">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Coach's comparison</h4>
              {d.self_assessment_feedback ? <Markdown>{d.self_assessment_feedback}</Markdown> : <p className="text-sm text-faint">No comparison available.</p>}
            </section>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardBody className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ListBlock title="Strengths" items={d.strengths} />
          <ListBlock title="Weaknesses" items={d.weaknesses} />
          <ListBlock title="Missed opportunities" items={d.missed_opportunities} />
          <ListBlock title="Next steps" items={d.next_steps} />
        </CardBody>
      </Card>
      {sim.reveal && (
        <Card>
          <CardHeader title="Behind the scenes" description="The intended attack chain and vulnerabilities in this lab." />
          <CardBody className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Intended chain</h4>
              <ol className="space-y-1.5 text-sm">
                {sim.reveal.intendedChain.map((x, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-4 shrink-0 tabular-nums text-faint">{i + 1}.</span>
                    {x}
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Vulnerabilities</h4>
              <ul className="space-y-2 text-sm">
                {sim.reveal.vulnerabilities.map((v, i) => (
                  <li key={i}>
                    <span className="font-medium">{v.title}</span> <span className="text-faint">on {v.host}</span>
                    <p className="text-muted">{v.detail}</p>
                  </li>
                ))}
                {!sim.reveal.vulnerabilities.length && <li className="text-faint">None listed.</li>}
              </ul>
            </section>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/* ── Engagement page ────────────────────────────────────────────── */

export function SimulationRun() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['simulation', id], queryFn: () => api.getSimulation(id), retry: false, refetchOnWindowFocus: false });
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [selfDebrief, setSelfDebrief] = useState('');
  const lastAction = useRef<string | null>(null);

  const end = useMutation({
    mutationFn: () => api.endSimulation(id, selfDebrief.trim()),
    onSuccess: (sim) => {
      qc.setQueryData(['simulation', id], sim);
      for (const k of ['simulations', 'dashboard', 'concepts']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: () => void q.refetch(),
  });

  const sendAction = async (text: string) => {
    lastAction.current = text;
    setActionError(null);
    setPending(text);
    try {
      const sim = await api.simAction(id, text);
      qc.setQueryData(['simulation', id], sim);
      return true;
    } catch (e) {
      setActionError(e);
      return false;
    } finally {
      setPending(null);
    }
  };

  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title={notFound ? 'Engagement not found' : "Couldn't load this engagement"}
          action={
            <Link to="/simulation">
              <Button variant="secondary">Back to simulations</Button>
            </Link>
          }
        >
          {(q.error as Error).message}
        </EmptyState>
      </Card>
    );
  }
  const sim = q.data;
  if (!sim) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  const active = sim.status === 'active';
  const latestSystem = [...sim.transcript].reverse().find((t) => t.role === 'system')?.id;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
          <Route className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{sim.title}</h2>
          <p className="text-xs text-muted">
            {focusName(sim.focus)} · {difficultyName(sim.difficulty).toLowerCase()} · {active ? `phase: ${SIM_PHASE_LABEL[sim.phase]}` : 'ended'}
          </p>
        </div>
        <Countdown sim={sim} />
        {active && (
          <Dialog.Root open={confirmEnd} onOpenChange={setConfirmEnd}>
            <Dialog.Trigger asChild>
              <Button variant="secondary" size="sm" disabled={!!pending || end.isPending}>
                <Flag /> End engagement
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-2xl outline-none">
                <Dialog.Title className="text-base font-semibold">Debrief yourself first</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted">
                  Before you see the coach's debrief: what path did you take, what worked, what would you do differently, and how sure are you that you found the main issue? The coach compares your read with what actually happened. You can't take further actions afterwards.
                </Dialog.Description>
                <label htmlFor="self-debrief" className="sr-only">
                  Your debrief
                </label>
                <textarea
                  id="self-debrief"
                  value={selfDebrief}
                  maxLength={6000}
                  rows={6}
                  onChange={(e) => setSelfDebrief(e.target.value)}
                  placeholder="My path was… What worked… I'd change… I'm fairly sure / unsure that…"
                  className="mt-4 block w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <div className="mt-5 flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button variant="ghost">Keep going</Button>
                  </Dialog.Close>
                  <Button
                    onClick={() => {
                      setConfirmEnd(false);
                      end.mutate();
                    }}
                  >
                    {selfDebrief.trim() ? 'End and compare' : 'Skip and end'}
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </div>

      {/* Authorized scope */}
      <div className="flex gap-3 rounded-lg border border-accent/30 bg-accent-soft/40 p-3 text-sm" role="note">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0">
          <span className="font-medium">Authorized lab scope:</span> <span className="font-mono text-xs">{sim.scope}</span>
          <span className="text-muted">
            {' '}
            · Attacker model: {sim.attackerModel} · Credentials: {sim.credentials}
          </span>
          <p className="text-xs text-faint">Fictional training environment. Never apply these actions to systems you are not authorized to test.</p>
        </div>
      </div>

      <PhaseTracker sim={sim} />

      {!active && (
        <>
          {end.isPending ? (
            <Card className="flex items-center justify-center gap-3 p-10 text-sm text-muted">
              <ThinkingDots className="text-accent" /> Writing your debrief…
            </Card>
          ) : sim.debrief ? (
            <Debrief sim={sim} d={sim.debrief} />
          ) : sim.actions === 0 ? (
            <Card className="p-5 text-sm text-muted">No actions were taken, so there is nothing to debrief.</Card>
          ) : end.isError ? (
            <ErrorBanner error={end.error} onRetry={() => end.mutate()}>
              The engagement is saved; retry the debrief when the AI is back.
            </ErrorBanner>
          ) : (
            <Card className="flex flex-col items-start gap-3 p-5 text-sm sm:flex-row sm:items-center">
              <span className="flex-1 text-muted">This engagement ended without a debrief.</span>
              <Button onClick={() => end.mutate()}>Get debrief</Button>
            </Card>
          )}
        </>
      )}

      {active && end.isError && <ErrorBanner error={end.error} onRetry={() => end.mutate()} />}
      {active && end.isPending && (
        <Card className="flex items-center justify-center gap-3 p-6 text-sm text-muted">
          <ThinkingDots className="text-accent" /> Ending the engagement and writing your debrief…
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader title="Engagement log" description={`${sim.actions} action${sim.actions === 1 ? '' : 's'}`} />
          <CardBody className="space-y-5">
            <Transcript sim={sim} pending={pending} />
            {active && sim.engagementOver && (
              <div className="flex flex-col gap-3 rounded-lg border border-accent/30 bg-accent-soft/40 p-4 text-sm sm:flex-row sm:items-center">
                <CheckCircle2 className="size-4 shrink-0 text-accent" />
                <span className="flex-1">The simulator considers this engagement complete.</span>
                <Button size="sm" onClick={() => setConfirmEnd(true)} disabled={end.isPending}>
                  Debrief <ArrowRight />
                </Button>
              </div>
            )}
            {active && !!actionError && <ErrorBanner error={actionError} onRetry={() => lastAction.current && void sendAction(lastAction.current)}>Your action was not recorded.</ErrorBanner>}
            {active && <ActionBox onSend={sendAction} busy={!!pending || end.isPending} />}
          </CardBody>
        </Card>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Attack path" description="What you have uncovered so far." />
            <CardBody>
              {sim.graph.length ? (
                <AttackGraph graph={sim.graph} latestStep={latestSystem} />
              ) : (
                <div className="grid h-40 place-items-center rounded-lg border border-dashed border-border text-center text-sm text-faint">
                  <div>
                    <Network className="mx-auto mb-2 size-5" />
                    Hosts, services and findings appear here as you discover them.
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Reasoning loop" />
            <CardBody>
              <LoopMeter loop={sim.loop} actions={sim.actions} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Objectives" />
            <CardBody>
              <ul className="space-y-2 text-sm">
                {sim.objectives.map((o, i) => (
                  <li key={i} className="flex gap-2">
                    {o.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-label="Done" /> : <Circle className="mt-0.5 size-4 shrink-0 text-faint" aria-label="Open" />}
                    <span className={cn(o.done && 'text-muted line-through')}>{o.text}</span>
                  </li>
                ))}
                {!sim.objectives.length && <li className="text-faint">No explicit objectives. Follow the briefing.</li>}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
