import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, CircleDot, Gauge, ListChecks, TrendingDown, TrendingUp, UserCheck, XCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { confidenceLabel, type EvaluationDTO, type Rubric } from '@psc/shared';
import { Markdown } from '@/components/Markdown';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { deltaPts, pctOf7, relative } from '@/lib/format';
import { cn } from '@/lib/utils';

export type Result = EvaluationDTO['result'];

export const RESULT: Record<Result, { icon: LucideIcon; label: string; tone: 'accent' | 'warning' | 'danger'; text: string }> = {
  correct: { icon: CheckCircle2, label: 'Correct', tone: 'accent', text: 'text-success' },
  partial: { icon: CircleDot, label: 'Partial', tone: 'warning', text: 'text-warning' },
  incorrect: { icon: XCircle, label: 'Incorrect', tone: 'danger', text: 'text-danger' },
};

export function ResultBadge({ result, className }: { result: Result; className?: string }) {
  const r = RESULT[result];
  return (
    <Badge tone={r.tone} className={cn('px-2.5 py-1 text-sm', className)}>
      <r.icon className="size-4" /> {r.label}
    </Badge>
  );
}

const SCORE_LABEL: Record<keyof EvaluationDTO['scores'], string> = {
  correctness: 'Correctness',
  conceptual_understanding: 'Conceptual understanding',
  reasoning_quality: 'Reasoning quality',
  pentest_application: 'Practical application',
  observation_vs_hypothesis: 'Observation vs hypothesis',
};

export function ScoreBars({ scores }: { scores: EvaluationDTO['scores'] }) {
  return (
    <ul className="space-y-2.5" aria-label="Scores">
      {(Object.keys(SCORE_LABEL) as (keyof EvaluationDTO['scores'])[]).map((k) => {
        const v = Math.max(0, Math.min(1, scores[k] ?? 0));
        return (
          <li key={k}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-muted">{SCORE_LABEL[k]}</span>
              <span className="font-semibold tabular-nums">{Math.round(v * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-accent-soft" role="meter" aria-label={SCORE_LABEL[k]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
              <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${v * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function MasteryChange({ before, after }: { before: number; after: number }) {
  const d = deltaPts(before, after);
  const Icon = d.value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 tabular-nums">
      <span className="text-muted">{pctOf7(before)}</span>
      <span className="text-faint" aria-hidden>
        →
      </span>
      <span className="font-semibold">{pctOf7(after)}</span>
      <span className={cn('inline-flex items-center gap-0.5 text-xs', d.value > 0 ? 'text-success' : d.value < 0 ? 'text-danger' : 'text-muted')}>
        <Icon className="size-3" />
        {d.label}
      </span>
    </span>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-faint">
        {Icon && <Icon className="size-3.5" />}
        {title}
      </h4>
      {children}
    </section>
  );
}

export function RubricView({ rubric }: { rubric: Rubric }) {
  return (
    <div className="space-y-4">
      {rubric.keyPoints.length > 0 && (
        <Section title="Key points" icon={ListChecks}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {rubric.keyPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </Section>
      )}
      {rubric.referenceAnswer && (
        <Section title="Reference answer">
          <Markdown>{rubric.referenceAnswer}</Markdown>
        </Section>
      )}
    </div>
  );
}

export function Collapsible({ summary, children, defaultOpen }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-lg border border-border" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
        {summary}
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

/** Stated confidence vs. result. Confident-but-wrong is the illusion of knowing worth flagging. */
export function CalibrationNote({ predicted, result }: { predicted?: number | null; result: Result }) {
  const label = confidenceLabel(predicted);
  if (!label) return null;
  const overconfident = predicted! >= 3 && result === 'incorrect';
  const underconfident = predicted! <= 2 && result === 'correct';
  return (
    <div
      data-testid="calibration-note"
      className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-sm', overconfident ? 'bg-warning-soft' : 'bg-surface-2')}
    >
      <Gauge className={cn('mt-0.5 size-4 shrink-0', overconfident ? 'text-warning' : 'text-muted')} />
      <p className="min-w-0">
        You said <span className="font-medium">{label}</span>.{' '}
        {overconfident
          ? 'Confident but wrong is an illusion of knowing. This one is flagged so you revisit it soon.'
          : underconfident
            ? 'You knew more than you thought. Trust retrieval a little more.'
            : 'Your confidence matched the result.'}
      </p>
    </div>
  );
}

/** Full feedback for an AI-evaluated answer. */
export function EvaluationPanel({ evaluation: e, footer }: { evaluation: EvaluationDTO; footer?: ReactNode }) {
  return (
    <Card className="min-w-0" data-testid="evaluation">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div className="flex items-center gap-3">
          <ResultBadge result={e.result} />
          {e.selfGraded && (
            <Badge>
              <UserCheck className="size-3" /> Self-graded
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="text-xs text-faint">Mastery</span> <MasteryChange before={e.masteryBefore} after={e.masteryAfter} />
          </span>
          {e.nextReview != null && (
            <span className="flex items-center gap-1 text-xs text-muted">
              <CalendarClock className="size-3.5" /> Next review {relative(e.nextReview)}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-5">
          <CalibrationNote predicted={e.predicted} result={e.result} />
          <Section title="Feedback">
            <Markdown>{e.feedback}</Markdown>
          </Section>
          {e.missingPoints.length > 0 && (
            <Section title="Missing points" icon={ListChecks}>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {e.missingPoints.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </Section>
          )}
          {e.misconceptions.length > 0 && (
            <Section title="Misconceptions" icon={AlertTriangle}>
              <ul className="space-y-1.5 text-sm">
                {e.misconceptions.map((m, i) => (
                  <li key={i} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Misconception" />
                    <span className="min-w-0">{m}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
        <div className="min-w-0">
          <Section title="Scores">
            <ScoreBars scores={e.scores} />
          </Section>
        </div>
      </div>
      <div className="space-y-4 px-5 pb-5">
        <Collapsible summary="Reference answer & rubric">
          <RubricView rubric={e.rubric} />
        </Collapsible>
        {footer}
      </div>
    </Card>
  );
}
