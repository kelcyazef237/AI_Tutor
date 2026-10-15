import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  Clock,
  Loader2,
  MessageSquareReply,
  Route,
  ServerOff,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AREAS, DOMAINS, MODES, SESSION_MODES, SessionMode, type ModeInfo } from '@psc/shared';
import { useAIStatus } from '@/components/layout/AIStatusPill';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { MODE_ICON as ICON } from '@/lib/modeIcons';
import { cn } from '@/lib/utils';

/** Rough minutes per question, used only for the time estimate. */
const MINUTES_PER_Q = 4;
const FOCUS_KEY = 'psc-train-focus';

function readFocus(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FOCUS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && DOMAINS.some((d) => d.id === x)) : [];
  } catch {
    return [];
  }
}

function ModeMeta({ m }: { m: ModeInfo }) {
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      <Badge>
        <Clock className="size-3" /> ~{m.count * MINUTES_PER_Q} min
      </Badge>
      <Badge>{m.count} questions</Badge>
      <Badge>{m.feedback === 'immediate' ? 'Feedback each answer' : 'Feedback at end'}</Badge>
      {m.followUps && (
        <Badge>
          <MessageSquareReply className="size-3" /> Follow-ups
        </Badge>
      )}
    </div>
  );
}

function ModeCard({ m, selected, recommended, onSelect }: { m: ModeInfo; selected: boolean; recommended: boolean; onSelect: () => void }) {
  const Icon = ICON[m.id];
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'group relative flex h-full flex-col rounded-xl border bg-surface p-5 text-left shadow-card transition-all',
        selected ? 'border-accent ring-2 ring-[var(--ring)]' : 'border-border hover:border-border-strong',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn('grid size-10 place-items-center rounded-lg transition-colors', selected ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted group-hover:text-text')}>
          <Icon className="size-5" />
        </div>
        {selected ? (
          <span className="grid size-5 place-items-center rounded-full bg-accent text-accent-fg">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        ) : (
          recommended && <Badge tone="accent">Recommended</Badge>
        )}
      </div>
      <h3 className="mt-4 font-semibold">{m.name}</h3>
      <p className="mt-1 flex-1 text-sm text-muted">{m.blurb}</p>
      <ModeMeta m={m} />
    </button>
  );
}

export function TrainPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: api.settings, retry: false });
  const ai = useAIStatus();

  const paramMode = SessionMode.safeParse(params.get('mode'));
  const [mode, setMode] = useState<SessionMode | null>(paramMode.success ? paramMode.data : null);
  const [focus, setFocus] = useState<string[]>(readFocus);

  // Default to the user's preferred mode once settings load (unless the URL picked one).
  useEffect(() => {
    if (!mode && settingsQ.data) setMode(settingsQ.data.preferredMode);
  }, [mode, settingsQ.data]);

  useEffect(() => {
    try {
      localStorage.setItem(FOCUS_KEY, JSON.stringify(focus));
    } catch {
      /* storage unavailable */
    }
  }, [focus]);

  const selected = mode ?? 'standard';
  const info = MODES[selected];
  const backendDown = ai.isError;
  const aiDown = ai.data && !ai.data.ok;

  const focusNames = useMemo(() => DOMAINS.filter((d) => focus.includes(d.id)).map((d) => d.name), [focus]);
  const toggle = (id: string) => setFocus((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const toggleArea = (areaId: string) => {
    const ids = DOMAINS.filter((d) => d.area === areaId).map((d) => d.id);
    const all = ids.every((id) => focus.includes(id));
    setFocus((f) => (all ? f.filter((x) => !ids.includes(x)) : [...new Set([...f, ...ids])]));
  };

  const start = useMutation({
    mutationFn: () => api.startSession({ mode: selected, domains: focus }),
    onSuccess: (s) => navigate(`/session/${s.id}`),
    onError: (e: Error) => toast.error('Could not start the session', { description: e.message }),
  });

  return (
    <>
      <PageHeader title="Train" description="Pick a mode. Questions adapt to your skill model: weak areas, due reviews, new material and challenge." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-8">
          {/* Modes */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-muted">Session mode</h3>
            <div role="radiogroup" aria-label="Session mode" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {SESSION_MODES.map((id) => (
                <ModeCard key={id} m={MODES[id]} selected={selected === id} recommended={paramMode.success && paramMode.data === id} onSelect={() => setMode(id)} />
              ))}
              <Link
                to="/simulation"
                className="group flex h-full flex-col rounded-xl border border-dashed border-border-strong p-5 transition-colors hover:border-accent hover:bg-accent-soft/40"
              >
                <div className="grid size-10 place-items-center rounded-lg bg-surface-2 text-muted group-hover:text-accent">
                  <Route className="size-5" />
                </div>
                <h3 className="mt-4 flex items-center gap-1.5 font-semibold">
                  {MODES.simulation.name} <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </h3>
                <p className="mt-1 text-sm text-muted">{MODES.simulation.blurb}</p>
              </Link>
            </div>
          </section>

          {/* Focus */}
          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-muted">
                Focus <span className="font-normal text-faint">· optional</span>
              </h3>
              {focus.length > 0 && (
                <button onClick={() => setFocus([])} className="text-xs text-muted hover:text-text">
                  Clear ({focus.length})
                </button>
              )}
            </div>
            <Card className="divide-y divide-border">
              {AREAS.map((a) => {
                const domains = DOMAINS.filter((d) => d.area === a.id);
                const allOn = domains.every((d) => focus.includes(d.id));
                return (
                  <div key={a.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                    <button onClick={() => toggleArea(a.id)} className={cn('w-40 shrink-0 text-left text-sm font-medium', allOn ? 'text-accent' : 'text-text hover:text-accent')} title={`Toggle all ${a.name}`}>
                      {a.name}
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      {domains.map((d) => {
                        const on = focus.includes(d.id);
                        return (
                          <button
                            key={d.id}
                            aria-pressed={on}
                            onClick={() => toggle(d.id)}
                            className={cn(
                              'inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
                              on ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:border-border-strong hover:text-text',
                            )}
                          >
                            {on && <Check className="size-3" strokeWidth={3} />}
                            {d.name}
                            <span className="text-faint">{d.concepts.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </Card>
            <p className="mt-2 text-xs text-faint">With no focus, the selector draws from every domain. Prerequisites outside your focus may still be pulled in when needed.</p>
          </section>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card className="p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-faint">Ready to start</div>
            <div className="mt-2 flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-accent text-accent-fg">
                {(() => {
                  const I = ICON[selected];
                  return <I className="size-[18px]" />;
                })()}
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{info.name}</div>
                <div className="text-xs text-muted">
                  {info.count} questions · ~{info.count * MINUTES_PER_Q} min
                </div>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Focus</dt>
                <dd className="truncate text-right" title={focusNames.join(', ')}>
                  {focusNames.length === 0 ? 'All domains' : focusNames.length <= 2 ? focusNames.join(', ') : `${focusNames.length} domains`}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Feedback</dt>
                <dd>{info.feedback === 'immediate' ? 'After each answer' : 'At the end'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Follow-ups</dt>
                <dd>{info.followUps ? 'On' : 'Off'}</dd>
              </div>
            </dl>
            <Button size="lg" className="mt-5 w-full" disabled={backendDown || start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> Building session…
                </>
              ) : (
                <>
                  Start session <ArrowRight />
                </>
              )}
            </Button>
            {backendDown && (
              <p className="mt-3 flex items-start gap-2 text-xs text-danger">
                <ServerOff className="mt-px size-3.5 shrink-0" /> The backend isn't running, so sessions can't start yet.
              </p>
            )}
            {!backendDown && aiDown && (
              <p className="mt-3 text-xs text-warning">The AI model is unavailable, so question generation and grading will fail until it's back.</p>
            )}
            <p className="mt-3 text-xs text-faint">
              Tip: press <kbd className="rounded border border-border px-1 font-mono">Ctrl</kbd> + <kbd className="rounded border border-border px-1 font-mono">Enter</kbd> to submit answers during a session.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
