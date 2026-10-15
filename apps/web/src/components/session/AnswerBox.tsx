import { ArrowRight, SkipForward } from 'lucide-react';
import { CONFIDENCE_LEVELS } from '@psc/shared';
import { useLayoutEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAX = 20_000;

/** Calm three-dot pulse used while the evaluator works (calls can take up to a minute). */
export function ThinkingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: `${i * 200}ms`, animationDuration: '1.4s' }} />
      ))}
    </span>
  );
}

/**
 * "How sure are you?" asked before feedback. Comparing this with the result over time is how the
 * learner calibrates their sense of what they know (Make It Stick, ch. 5).
 */
export function ConfidencePicker({ value, onChange, disabled }: { value: number | null; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div>
      <div id="confidence-label" className="mb-1.5 text-sm font-medium">
        How sure are you?
      </div>
      <div role="radiogroup" aria-labelledby="confidence-label" className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-2 p-1 sm:grid-cols-4">
        {CONFIDENCE_LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={value === l.value}
            disabled={disabled}
            title={`Alt+${l.value}`}
            onClick={() => onChange(l.value)}
            className={cn(
              'rounded-md px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text disabled:opacity-50',
              value === l.value && 'bg-surface text-text shadow-card ring-1 ring-[var(--ring)]',
            )}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AnswerBox({
  value,
  onChange,
  onSubmit,
  onSkip,
  submitting,
  disabled,
  confidence,
  onConfidence,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  submitting: boolean;
  disabled?: boolean;
  /** When `onConfidence` is given, a confidence rating is required before submitting. */
  confidence?: number | null;
  onConfidence?: (v: number) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow with content.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 140), 560)}px`;
  }, [value]);

  const needsConfidence = !!onConfidence && confidence == null;
  const canSubmit = !submitting && !disabled && value.trim().length > 0 && !needsConfidence;

  return (
    <div className="min-w-0">
      <label htmlFor="answer" className="mb-2 block text-sm font-medium">
        Your answer
      </label>
      <textarea
        id="answer"
        ref={ref}
        value={value}
        maxLength={MAX}
        disabled={submitting || disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (canSubmit) onSubmit();
          } else if (onConfidence && e.altKey && /^[1-4]$/.test(e.key)) {
            e.preventDefault();
            onConfidence(Number(e.key));
          }
        }}
        placeholder="Reason it through: what you observe, what you think it means, and how you'd confirm it."
        className="block min-h-[140px] w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm leading-relaxed text-text placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
      />
      {onConfidence && (
        <div className="mt-3">
          <ConfidencePicker value={confidence ?? null} onChange={onConfidence} disabled={submitting || disabled} />
          {needsConfidence && value.trim().length > 0 && <p className="mt-1.5 text-xs text-muted">Rate your confidence before you see feedback. It is how you learn to spot what you only think you know.</p>}
        </div>
      )}
      <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-faint">
          <span className="tabular-nums">{value.length.toLocaleString()}</span> characters ·{' '}
          <kbd className="rounded border border-border px-1 font-mono">Ctrl</kbd> + <kbd className="rounded border border-border px-1 font-mono">Enter</kbd> to submit
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={submitting || disabled} onClick={onSkip}>
            <SkipForward /> Skip
          </Button>
          <Button disabled={!canSubmit} onClick={onSubmit} aria-busy={submitting}>
            {submitting ? (
              <>
                <ThinkingDots /> Evaluating…
              </>
            ) : (
              <>
                Submit answer <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
