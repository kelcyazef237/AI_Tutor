import * as Dialog from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleSlash, CornerDownRight, Flag, Loader2, RotateCcw, ServerOff, Sparkles, Timer, UserCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MODES, type AnswerRequest, type EvaluationDTO, type PublicQuestion, type Rubric, type SessionDTO, type SessionEndDTO } from '@psc/shared';
import { Markdown } from '@/components/Markdown';
import { AnswerBox, ThinkingDots } from '@/components/session/AnswerBox';
import { EvaluationPanel, MasteryChange, ResultBadge, RubricView } from '@/components/session/Feedback';
import { QuestionCard } from '@/components/session/QuestionCard';
import { SessionSummary } from '@/components/session/Summary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { clock } from '@/lib/format';
import { MODE_ICON } from '@/lib/modeIcons';

/* ── Draft persistence (per question, survives reloads) ─────────── */

export const draftKey = (questionId: string) => `psc-draft-${questionId}`;
function readDraft(questionId: string) {
  try {
    return sessionStorage.getItem(draftKey(questionId)) ?? '';
  } catch {
    return '';
  }
}
function writeDraft(questionId: string, text: string) {
  try {
    if (text) sessionStorage.setItem(draftKey(questionId), text);
    else sessionStorage.removeItem(draftKey(questionId));
  } catch {
    /* storage unavailable */
  }
}

/** Delay before auto-advancing after an exam answer is recorded. */
export const RECORDED_ADVANCE_MS = 700;

const AI_KINDS = new Set(['quota', 'unavailable', 'timeout', 'invalid_output', 'auth', 'unknown']);

type Phase =
  | { t: 'answering' }
  | { t: 'submitting' }
  | { t: 'evaluated'; evaluation: EvaluationDTO }
  | { t: 'self_grade'; attemptId: string; rubric: Rubric; reason: string; answer: string }
  | { t: 'self_graded'; evaluation: EvaluationDTO }
  | { t: 'recorded' }
  | { t: 'advancing' }
  | { t: 'ending' }
  | { t: 'finished'; data: SessionEndDTO };

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/* ── Header ─────────────────────────────────────────────────────── */

function SessionHeader({ session, finished, onEnd, ending }: { session: SessionDTO; finished: boolean; onEnd: () => void; ending: boolean }) {
  const Icon = MODE_ICON[session.mode];
  const now = useNow(!finished);
  const elapsed = (session.endedAt ?? now) - session.startedAt;
  const progress = session.total ? Math.min(1, session.answered / session.total) : 0;
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
          <Icon className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{MODES[session.mode].name}</h2>
          <p className="text-xs text-muted">{session.feedbackMode === 'end' ? 'Feedback at the end' : 'Feedback after each answer'}</p>
        </div>
        <div className="flex items-center gap-1.5 text-sm tabular-nums text-muted" aria-label="Elapsed time">
          <Timer className="size-4" /> {clock(elapsed)}
        </div>
        {!finished && (
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <Button variant="secondary" size="sm">
                <Flag /> End session
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-2xl outline-none">
                <Dialog.Title className="text-base font-semibold">End this session?</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted">
                  You've answered {session.answered} of {session.total}. Answers so far are kept and you'll see the summary.
                </Dialog.Description>
                <div className="mt-5 flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button variant="ghost">Keep going</Button>
                  </Dialog.Close>
                  <Button
                    variant="danger"
                    disabled={ending}
                    onClick={() => {
                      setOpen(false);
                      onEnd();
                    }}
                  >
                    End session
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Progress</span>
          <span className="tabular-nums">
            {session.answered} / {session.total}
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-accent-soft"
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={session.total}
          aria-valuenow={session.answered}
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ── Self-grade ─────────────────────────────────────────────────── */

const SELF_GRADES = [
  { score: 0, label: 'Missed it' },
  { score: 0.5, label: 'Partly' },
  { score: 1, label: 'Nailed it' },
] as const;

function SelfGradePanel({ phase, onGrade, busy, error }: { phase: Extract<Phase, { t: 'self_grade' }>; onGrade: (score: number) => void; busy: number | null; error: string | null }) {
  return (
    <Card className="min-w-0" data-testid="self-grade">
      <div className="flex gap-3 border-b border-border bg-warning-soft/60 p-5 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="font-medium">The AI evaluator is unavailable, so grade this one yourself.</p>
          <p className="mt-0.5 text-muted">{phase.reason}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
        <section className="min-w-0">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Your answer</h4>
          <div className="whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-2 p-3 text-sm">{phase.answer || <span className="text-faint">(skipped)</span>}</div>
        </section>
        <section className="min-w-0">
          <RubricView rubric={phase.rubric} />
          {!phase.rubric.keyPoints.length && !phase.rubric.referenceAnswer && <p className="text-sm text-faint">No rubric is available for this question.</p>}
        </section>
      </div>
      <div className="border-t border-border p-5">
        <p className="mb-3 text-sm font-medium">How did your answer compare?</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {SELF_GRADES.map((g) => (
            <Button key={g.score} variant="secondary" disabled={busy !== null} onClick={() => onGrade(g.score)}>
              {busy === g.score && <Loader2 className="animate-spin" />}
              {g.label}
            </Button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>
    </Card>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */

function errorInfo(e: unknown) {
  if (e instanceof ApiError) return { message: e.message, kind: e.kind, status: e.status };
  return { message: (e as Error)?.message ?? 'Something went wrong', kind: undefined, status: -1 };
}

export function SessionPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['session', id], queryFn: () => api.getSession(id), retry: false, staleTime: Infinity, refetchOnWindowFocus: false });

  const [session, setSession] = useState<SessionDTO | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [prior, setPrior] = useState<EvaluationDTO | null>(null); // evaluation shown above a follow-up
  const [phase, setPhase] = useState<Phase>({ t: 'answering' });
  const [draft, setDraft] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [answerError, setAnswerError] = useState<ReturnType<typeof errorInfo> | null>(null);
  const [flowError, setFlowError] = useState<{ message: string; retry: () => void } | null>(null);
  const [gradeBusy, setGradeBusy] = useState<number | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const lastPayload = useRef<AnswerRequest | null>(null);
  const shownAt = useRef(Date.now());
  const endStarted = useRef(false);

  // Seed local state from the first load.
  useEffect(() => {
    if (q.data && !session) {
      setSession(q.data);
      setQuestion(q.data.current);
    }
  }, [q.data, session]);

  // New question: reset timer and restore any saved draft.
  useEffect(() => {
    if (!question) return;
    shownAt.current = Date.now();
    setDraft(readDraft(question.id));
    setConfidence(null);
    setAnswerError(null);
  }, [question?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDraft = (v: string) => {
    setDraft(v);
    if (question) writeDraft(question.id, v);
  };

  const end = useCallback(async () => {
    if (!id) return;
    endStarted.current = true;
    setFlowError(null);
    setPhase({ t: 'ending' });
    try {
      const data = await api.endSession(id);
      setSession((s) => (s ? { ...s, endedAt: data.summary.endedAt ?? Date.now(), answered: data.summary.answered, total: data.summary.total } : s));
      setPhase({ t: 'finished', data });
      for (const k of ['dashboard', 'sessions', 'concepts']) qc.invalidateQueries({ queryKey: [k] });
    } catch (e) {
      setFlowError({ message: errorInfo(e).message, retry: () => void end() });
    }
  }, [id, qc]);

  // A session that loads already finished goes straight to the summary.
  useEffect(() => {
    if (session && !session.current && !question && !endStarted.current) void end();
  }, [session, question, end]);

  const next = useCallback(async () => {
    setFlowError(null);
    setPhase({ t: 'advancing' });
    try {
      const s = await api.nextQuestion(id);
      setSession(s);
      setPrior(null);
      if (!s.current) {
        setQuestion(null);
        await end();
        return;
      }
      setQuestion(s.current);
      setPhase({ t: 'answering' });
    } catch (e) {
      setFlowError({ message: errorInfo(e).message, retry: () => void next() });
    }
  }, [id, end]);

  // Exam mode: brief confirmation, then advance.
  useEffect(() => {
    if (phase.t !== 'recorded') return;
    const t = setTimeout(() => void next(), RECORDED_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [phase.t, next]);

  // Reassure the learner on slow evaluations.
  useEffect(() => {
    if (phase.t !== 'submitting') return setSlow(false);
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [phase.t]);

  const send = async (payload: AnswerRequest) => {
    lastPayload.current = payload;
    setAnswerError(null);
    setPhase({ t: 'submitting' });
    try {
      const res = await api.answer(id, payload);
      writeDraft(payload.questionId, '');
      setSession(res.session);
      if (res.kind === 'evaluated') {
        if (res.evaluation.followUp) {
          setPrior(res.evaluation);
          setQuestion(res.evaluation.followUp);
          setPhase({ t: 'answering' });
        } else {
          setPrior(null);
          setPhase({ t: 'evaluated', evaluation: res.evaluation });
        }
      } else if (res.kind === 'needs_self_grade') {
        setPrior(null);
        setGradeError(null);
        setPhase({ t: 'self_grade', attemptId: res.attemptId, rubric: res.rubric, reason: res.reason, answer: payload.answer });
      } else {
        setPrior(null);
        setPhase({ t: 'recorded' });
      }
    } catch (e) {
      setAnswerError(errorInfo(e));
      setPhase({ t: 'answering' });
    }
  };

  const submit = (skipped: boolean) => {
    if (!question) return;
    void send({ questionId: question.id, answer: skipped ? '' : draft, durationMs: Math.max(0, Math.round(Date.now() - shownAt.current)), skipped, confidence: skipped ? null : confidence });
  };

  const selfGrade = async (score: number) => {
    if (phase.t !== 'self_grade') return;
    setGradeBusy(score);
    setGradeError(null);
    try {
      const evaluation = await api.selfGrade(phase.attemptId, score);
      setPhase({ t: 'self_graded', evaluation });
    } catch (e) {
      setGradeError(errorInfo(e).message);
    } finally {
      setGradeBusy(null);
    }
  };

  /* ── Load states ── */

  if (q.isError) {
    const err = errorInfo(q.error);
    if (err.status === 404 || err.status === 0) {
      return (
        <Card>
          <EmptyState
            icon={ServerOff}
            title="The session engine isn't available yet"
            action={
              <Link to="/train">
                <Button variant="secondary">Back to Train</Button>
              </Link>
            }
          >
            {err.status === 404
              ? "This session couldn't be loaded. Either it doesn't exist or the server's session API hasn't been built yet."
              : err.message}
          </EmptyState>
        </Card>
      );
    }
    return (
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load this session"
          action={
            <Button variant="secondary" onClick={() => q.refetch()}>
              <RotateCcw /> Retry
            </Button>
          }
        >
          {err.message}
        </EmptyState>
      </Card>
    );
  }

  if (!session) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const finished = phase.t === 'finished';
  const showGreeting = !!session.greeting && session.answered === 0 && !prior && question && !question.isFollowUp && (phase.t === 'answering' || phase.t === 'submitting');
  const answering = phase.t === 'answering' || phase.t === 'submitting';
  const isAIError = answerError && (answerError.kind ? AI_KINDS.has(answerError.kind) : false);

  return (
    <div className="mx-auto max-w-4xl">
      <SessionHeader session={session} finished={finished} onEnd={() => void end()} ending={phase.t === 'ending'} />

      {flowError && (
        <div role="alert" className="mb-4 flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger sm:flex-row sm:items-center">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{flowError.message}</span>
          <Button variant="secondary" size="sm" onClick={flowError.retry}>
            <RotateCcw /> Retry
          </Button>
        </div>
      )}

      {finished ? (
        <SessionSummary data={phase.data} mode={session.mode} />
      ) : phase.t === 'ending' || phase.t === 'advancing' ? (
        !flowError && (
          <Card className="flex items-center justify-center gap-3 p-10 text-sm text-muted">
            <ThinkingDots className="text-accent" /> {phase.t === 'ending' ? 'Wrapping up your session…' : 'Loading the next question…'}
          </Card>
        )
      ) : (
        <div className="space-y-6">
          {showGreeting && (
            <Card className="flex gap-3 border-accent/30 bg-accent-soft/40 p-4">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
              <Markdown className="min-w-0">{session.greeting}</Markdown>
            </Card>
          )}

          {prior && <EvaluationPanel evaluation={prior} />}

          {question && (
            <>
              {prior && question.isFollowUp && (
                <div className="flex items-start gap-2 text-sm text-muted">
                  <CornerDownRight className="mt-0.5 size-4 shrink-0 text-accent" />
                  <p>
                    <span className="font-medium text-text">Follow-up.</span> The mentor wants to probe this a little further before moving on.
                  </p>
                </div>
              )}
              <QuestionCard q={question} index={question.isFollowUp ? undefined : Math.min(session.total, session.answered + (answering ? 1 : 0))} />
            </>
          )}

          {answering && question && (
            <Card className="p-5">
              {answerError && (
                <div role="alert" className="mb-4 flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm sm:flex-row sm:items-center">
                  <AlertTriangle className="size-4 shrink-0 text-warning" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{isAIError ? (answerError.kind === 'quota' ? 'AI quota reached' : 'AI evaluator unavailable') : "Couldn't submit your answer"}</p>
                    <p className="text-muted">{answerError.message} Your answer is kept.</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => lastPayload.current && void send(lastPayload.current)}>
                    <RotateCcw /> Retry
                  </Button>
                </div>
              )}
              <AnswerBox
                value={draft}
                onChange={onDraft}
                onSubmit={() => submit(false)}
                onSkip={() => submit(true)}
                submitting={phase.t === 'submitting'}
                confidence={confidence}
                onConfidence={setConfidence}
              />
              {phase.t === 'submitting' && (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted" role="status">
                  <ThinkingDots className="text-accent" />
                  {slow ? 'Still evaluating. Thorough grading can take up to a minute.' : 'The mentor is reading your answer…'}
                </p>
              )}
            </Card>
          )}

          {phase.t === 'evaluated' && (
            <EvaluationPanel
              evaluation={phase.evaluation}
              footer={
                <div className="flex justify-end">
                  <Button autoFocus onClick={() => void next()}>
                    Next question <ArrowRight />
                  </Button>
                </div>
              }
            />
          )}

          {phase.t === 'self_grade' && <SelfGradePanel phase={phase} onGrade={(s) => void selfGrade(s)} busy={gradeBusy} error={gradeError} />}

          {phase.t === 'self_graded' && (
            <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center" data-testid="self-graded">
              <div className="flex flex-1 flex-wrap items-center gap-3 text-sm">
                <ResultBadge result={phase.evaluation.result} />
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <UserCheck className="size-3.5" /> Self-graded
                </span>
                <MasteryChange before={phase.evaluation.masteryBefore} after={phase.evaluation.masteryAfter} />
              </div>
              <Button autoFocus onClick={() => void next()}>
                Next question <ArrowRight />
              </Button>
            </Card>
          )}

          {phase.t === 'recorded' && (
            <Card className="flex items-center gap-3 p-5 text-sm" role="status">
              <CheckCircle2 className="size-5 text-accent" />
              <span className="font-medium">Answer recorded</span>
              <span className="text-muted">Feedback comes at the end of the exam.</span>
            </Card>
          )}

          {!question && phase.t === 'answering' && (
            <Card>
              <EmptyState icon={CircleSlash} title="No question to show">
                This session has no current question.
              </EmptyState>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
