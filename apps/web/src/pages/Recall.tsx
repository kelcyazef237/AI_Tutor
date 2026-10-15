import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Brain, CalendarClock, CheckCircle2, CircleDot, Circle, Link2, Loader2, Play, RotateCcw, Timer, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AREAS, DOMAIN_BY_ID, DOMAINS, RECALL_LABEL, RECALL_LEVELS, type RecallDTO, type RecallLevel } from '@psc/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Markdown } from '@/components/Markdown';
import { ThinkingDots } from '@/components/session/AnswerBox';
import { Collapsible } from '@/components/session/Feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Label, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { clock, relative } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Recall level is always icon + label, never color alone. */
export const LEVEL: Record<RecallLevel, { icon: LucideIcon; className: string }> = {
  solid: { icon: CheckCircle2, className: 'text-accent' },
  partial: { icon: CircleDot, className: 'text-warning' },
  none: { icon: Circle, className: 'text-faint' },
};

/** Share of the domain produced: solid counts 1, partial 0.5. */
export function coverage(r: RecallDTO): number | null {
  if (!r.result?.concepts.length) return null;
  const c = r.result.concepts;
  return c.reduce((s, x) => s + (x.recalled === 'solid' ? 1 : x.recalled === 'partial' ? 0.5 : 0), 0) / c.length;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const draftKey = (id: string) => `psc-recall-${id}`;
function readDraft(id: string) {
  try {
    return localStorage.getItem(draftKey(id)) ?? '';
  } catch {
    return '';
  }
}
function writeDraft(id: string, text: string) {
  try {
    if (text) localStorage.setItem(draftKey(id), text);
    else localStorage.removeItem(draftKey(id));
  } catch {
    /* storage unavailable */
  }
}

/* ── Lobby ──────────────────────────────────────────────────────── */

export function RecallLobby() {
  const navigate = useNavigate();
  const list = useQuery({ queryKey: ['recalls'], queryFn: api.recalls, retry: false });
  const [domain, setDomain] = useState(DOMAINS[0]!.id);
  const start = useMutation({
    mutationFn: () => api.startRecall(domain),
    onSuccess: (r) => navigate(`/recall/${r.id}`),
  });

  return (
    <>
      <PageHeader title="Free Recall" description="A blank page and ten minutes. Write everything you remember, then see what you missed." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Start a brain dump" description="No notes, no hints. Struggling to retrieve is what strengthens memory." />
          <CardBody className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="recall-domain">Domain</Label>
              <Select id="recall-domain" value={domain} onChange={(e) => setDomain(e.target.value)}>
                {AREAS.map((a) => (
                  <optgroup key={a.id} label={a.name}>
                    {DOMAINS.filter((d) => d.area === a.id).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.concepts.length} concepts)
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </div>
            {start.isError && <p className="text-sm text-danger">{(start.error as Error).message}</p>}
            <Button size="lg" onClick={() => start.mutate()} disabled={start.isPending}>
              {start.isPending ? <Loader2 className="animate-spin" /> : <Play />} Start writing
            </Button>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Why this works" />
          <CardBody>
            <ul className="space-y-2.5 text-sm text-muted">
              <li>Retrieving from memory strengthens it far more than rereading.</li>
              <li>What you can't produce is exactly what to study next. Concepts you've studied before but didn't recall go straight to your review queue.</li>
              <li>Explaining how ideas connect builds the mental model you'll use on a real engagement.</li>
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Past recalls" />
        <CardBody className="p-0 pt-3">
          {list.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-12" />
            </div>
          ) : list.isError ? (
            <EmptyState icon={AlertTriangle} title="Couldn't load recalls">
              {(list.error as Error).message}
            </EmptyState>
          ) : !list.data?.length ? (
            <EmptyState icon={Brain} title="No recalls yet">
              Pick a domain you've practised and see how much you can produce from memory.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {list.data.map((r) => {
                const cov = coverage(r);
                return (
                  <li key={r.id}>
                    <Link to={`/recall/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.domainName}</div>
                        <div className="text-xs text-faint">{relative(r.startedAt)}</div>
                      </div>
                      {r.status === 'writing' ? <Badge tone="accent">In progress</Badge> : <Badge>{cov == null ? 'Reviewed' : `${pct(cov)} recalled`}</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}

/* ── Writing / review ───────────────────────────────────────────── */

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Writing({ recall, onDone }: { recall: RecallDTO; onDone: (r: RecallDTO, needsSelfCheck: string | null) => void }) {
  const [text, setText] = useState(() => recall.text || readDraft(recall.id));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow(true);
  const left = recall.minutes * 60_000 - (now - recall.startedAt);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.submitRecall(recall.id, text);
      writeDraft(recall.id, '');
      onDone(res.recall, res.kind === 'needs_self_check' ? res.reason : null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted">
            Close your notes. Write everything you can remember about <span className="font-medium text-text">{recall.domainName}</span>: the concepts, how they work, how they connect, and how you'd use them on a test. When you stall, keep going. The struggle is the point.
          </p>
          <span className={cn('flex items-center gap-1.5 text-sm tabular-nums', left < 0 ? 'text-warning' : 'text-muted')} aria-label="Time remaining">
            <Timer className="size-4" /> {left >= 0 ? clock(left) : `time's up · +${clock(-left)}`}
          </span>
        </div>
        <label htmlFor="recall-text" className="sr-only">
          Everything you remember
        </label>
        <textarea
          id="recall-text"
          value={text}
          maxLength={30_000}
          disabled={busy}
          autoFocus
          onChange={(e) => {
            setText(e.target.value);
            writeDraft(recall.id, e.target.value);
          }}
          placeholder="Start anywhere…"
          className="block min-h-[360px] w-full resize-y rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
        />
        {!!error && (
          <div role="alert" className="flex items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            <AlertTriangle className="size-4 shrink-0" /> {(error as Error).message}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-faint">{text.trim() ? `${text.trim().split(/\s+/).length} words` : 'Nothing written yet'} · draft saved on this device</span>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? (
              <>
                <ThinkingDots /> Comparing…
              </>
            ) : (
              <>
                I'm done, compare <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function SelfCheck({ recall, reason, onDone }: { recall: RecallDTO; reason: string; onDone: (r: RecallDTO) => void }) {
  const domain = DOMAIN_BY_ID[recall.domainId]!;
  const [levels, setLevels] = useState<Record<string, RecallLevel>>({});
  const save = useMutation({
    mutationFn: () => api.selfCheckRecall(recall.id, domain.concepts.map((c) => ({ conceptId: c.id, recalled: levels[c.id] ?? 'none' }))),
    onSuccess: onDone,
  });
  return (
    <Card data-testid="recall-self-check">
      <div className="flex gap-3 border-b border-border bg-warning-soft/60 p-5 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="font-medium">The AI reviewer is unavailable, so check yourself against the concept list.</p>
          <p className="mt-0.5 text-muted">{reason} Be strict: "Recalled well" means you explained how it works, not just named it.</p>
        </div>
      </div>
      <CardBody className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">What you wrote</h4>
          <div className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-2 p-3 text-sm">{recall.text || <span className="text-faint">(empty)</span>}</div>
        </section>
        <section className="min-w-0">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Concepts in {domain.name}</h4>
          <ul className="space-y-2">
            {domain.concepts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-sm">{c.name}</span>
                <div role="radiogroup" aria-label={c.name} className="flex rounded-md border border-border bg-surface-2 p-0.5">
                  {RECALL_LEVELS.map((l) => (
                    <button
                      key={l}
                      role="radio"
                      aria-checked={(levels[c.id] ?? 'none') === l}
                      onClick={() => setLevels((x) => ({ ...x, [c.id]: l }))}
                      className={cn('rounded px-2 py-1 text-[11px] font-medium text-muted hover:text-text', (levels[c.id] ?? 'none') === l && 'bg-surface text-text shadow-card')}
                    >
                      {l === 'none' ? 'No' : l === 'partial' ? 'Partly' : 'Well'}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </CardBody>
      <div className="flex items-center justify-end gap-3 border-t border-border p-5">
        {save.isError && <span className="text-sm text-danger">{(save.error as Error).message}</span>}
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />} Save self-check
        </Button>
      </div>
    </Card>
  );
}

function Results({ recall }: { recall: RecallDTO }) {
  const r = recall.result!;
  const counts = useMemo(() => Object.fromEntries(RECALL_LEVELS.map((l) => [l, r.concepts.filter((c) => c.recalled === l).length])) as Record<RecallLevel, number>, [r]);
  const scheduled = r.concepts.filter((c) => c.scheduled).length;
  const cov = coverage(recall);
  return (
    <div className="space-y-6" data-testid="recall-results">
      <Card className="overflow-hidden border-accent/30 bg-gradient-to-br from-accent-soft/70 to-surface">
        <div className="flex flex-col gap-5 p-5 sm:flex-row">
          <div className="shrink-0">
            <div className="text-xs font-medium uppercase tracking-wider text-accent">Recalled</div>
            <div className="text-4xl font-semibold tabular-nums tracking-tight">{cov == null ? '—' : pct(cov)}</div>
            <div className="text-xs text-muted">
              {counts.solid} well · {counts.partial} partly · {counts.none} missed
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <Markdown>{r.feedback}</Markdown>
            {recall.selfChecked && <Badge>Self-checked</Badge>}
          </div>
        </div>
      </Card>

      {scheduled > 0 && (
        <Card className="flex flex-col gap-3 p-5 text-sm sm:flex-row sm:items-center">
          <CalendarClock className="size-5 shrink-0 text-accent" />
          <p className="min-w-0 flex-1">
            <span className="font-medium">{scheduled} concept{scheduled === 1 ? '' : 's'} you studied before didn't come back.</span>{' '}
            <span className="text-muted">They are now due for review.</span>
          </p>
          <Link to="/train?mode=review">
            <Button>
              Review them now <ArrowRight />
            </Button>
          </Link>
        </Card>
      )}

      <Card>
        <CardHeader title="Concept by concept" />
        <CardBody>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
            {r.concepts.map((c) => {
              const L = LEVEL[c.recalled];
              return (
                <li key={c.conceptId} className="flex gap-2.5">
                  <L.icon className={cn('mt-0.5 size-4 shrink-0', L.className)} aria-hidden />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link to={`/skills?c=${c.conceptId}`} className="text-sm font-medium hover:text-accent">
                        {c.conceptName}
                      </Link>
                      <span className="text-xs text-muted">{RECALL_LABEL[c.recalled]}</span>
                      {c.scheduled && <Badge tone="warning">Due for review</Badge>}
                    </div>
                    {c.note && <p className="text-xs text-muted">{c.note}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {(r.errors.length > 0 || r.connections.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {r.errors.length > 0 && (
            <Card>
              <CardHeader title="Things you got wrong" description="Recorded as misconceptions so the coach can probe them." />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {r.errors.map((e, i) => (
                    <li key={i} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Misconception" />
                      <span className="min-w-0">
                        <span className="font-medium">{e.conceptName}:</span> {e.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          {r.connections.length > 0 && (
            <Card>
              <CardHeader title="Connections you made" />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {r.connections.map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <Link2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      {c}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <Collapsible summary="What you wrote">
        <p className="whitespace-pre-wrap break-words text-sm">{recall.text || <span className="text-faint">(empty)</span>}</p>
      </Collapsible>

      <div className="flex justify-end">
        <Link to="/recall">
          <Button variant="secondary">
            <RotateCcw /> Recall another domain
          </Button>
        </Link>
      </div>
    </div>
  );
}

export function RecallRun() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['recall', id], queryFn: () => api.getRecall(id), retry: false, refetchOnWindowFocus: false });
  const [selfCheckReason, setSelfCheckReason] = useState<string | null>(null);

  const settle = (r: RecallDTO) => {
    qc.setQueryData(['recall', id], r);
    for (const k of ['recalls', 'dashboard', 'concepts']) qc.invalidateQueries({ queryKey: [k] });
  };

  if (q.isError) {
    return (
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title={q.error instanceof ApiError && q.error.status === 404 ? 'Recall not found' : "Couldn't load this recall"}
          action={
            <Link to="/recall">
              <Button variant="secondary">Back to Free Recall</Button>
            </Link>
          }
        >
          {(q.error as Error).message}
        </EmptyState>
      </Card>
    );
  }
  const recall = q.data;
  if (!recall) return <Skeleton className="h-96 w-full rounded-xl" />;

  // A submitted-but-unreviewed recall (e.g. reloaded during an outage) resumes at the self-check.
  const needsCheck = recall.status === 'writing' && (selfCheckReason != null || recall.submittedAt != null);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
          <Brain className="size-[18px]" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">Free recall: {recall.domainName}</h2>
          <p className="text-xs text-muted">Started {relative(recall.startedAt)}</p>
        </div>
      </div>
      {recall.status === 'reviewed' ? (
        <Results recall={recall} />
      ) : needsCheck ? (
        <SelfCheck recall={recall} reason={selfCheckReason ?? 'The AI reviewer could not be reached.'} onDone={settle} />
      ) : (
        <Writing
          recall={recall}
          onDone={(r, reason) => {
            setSelfCheckReason(reason);
            settle(r);
          }}
        />
      )}
    </div>
  );
}
