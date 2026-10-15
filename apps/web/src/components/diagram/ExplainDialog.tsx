import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, MessageSquare, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DiagramSpec } from '@psc/shared';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';

export interface ExplainTarget {
  kind: 'node' | 'edge';
  id: string;
}

/**
 * Tap-a-label popup: shows the AI's plain-language explanation for one component
 * or connection. "Go deeper" asks the AI for a fresh, expanded explanation.
 */
export function ExplainDialog({
  spec,
  target,
  onClose,
  onExplain,
  onAsk,
  portalContainer,
}: {
  spec: DiagramSpec;
  target: ExplainTarget | null;
  onClose: () => void;
  onExplain?: (target: ExplainTarget) => Promise<string | null>;
  /** Open the diagram chat focused on this element. */
  onAsk?: (target: ExplainTarget) => void;
  /** Render inside the frame so the popup also works in fullscreen presentation. */
  portalContainer?: HTMLElement | null;
}) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const node = target?.kind === 'node' ? spec.nodes.find((n) => n.id === target.id) : undefined;
  const edge = target?.kind === 'edge' ? spec.edges.find((e) => e.id === target.id) : undefined;
  const title = node?.title ?? (edge ? (edge.label ? `${edge.label}` : 'Connection') : '');
  const fromTo = edge ? `${spec.nodes.find((n) => n.id === edge.from)?.title ?? edge.from} → ${spec.nodes.find((n) => n.id === edge.to)?.title ?? edge.to}` : null;

  const stored = node?.explain ?? edge?.explain ?? null;

  useEffect(() => {
    setText(stored);
    setLoading(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, target?.id, stored]);

  const goDeeper = async () => {
    if (!target || !onExplain || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await onExplain(target);
      if (res) setText(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={!!target} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal container={portalContainer ?? undefined}>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-surface shadow-2xl outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0">
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
                {title}
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                  {target?.kind === 'edge' ? 'connection' : 'component'}
                </span>
              </Dialog.Title>
              {node?.sub && <p className="mt-0.5 truncate text-sm text-muted">{node.sub}</p>}
              {edge && (
                <p className="mt-0.5 text-sm text-muted">
                  {fromTo}
                  {edge.kind !== 'flow' && <span className="text-faint"> · {edge.kind}</span>}
                </p>
              )}
              {node && node.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {node.tags.map((t) => (
                    <span key={t} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Close explanation">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4" aria-live="polite">
            {text ? (
              <div className="[&_p]:leading-relaxed">
                <Markdown>{text}</Markdown>
              </div>
            ) : loading ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin text-accent" /> Writing a plain-language explanation…
              </div>
            ) : (
              <p className="text-sm text-faint">
                The AI didn’t write an explanation for this yet.{onExplain ? ' Generate one now — it will be remembered for next time.' : ''}
              </p>
            )}
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </div>

          {(onExplain || onAsk) && (
            <div className="flex items-center justify-between gap-2 border-t border-border p-3">
              <span className="hidden text-[11px] text-faint sm:block">Plain terms · {node ? 'what it is and what it does here' : 'what travels on this wire'}</span>
              <div className="flex items-center gap-2">
                {onAsk && target && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      onAsk(target);
                      onClose();
                    }}
                    data-testid="explain-ask"
                  >
                    <MessageSquare className="size-3.5" /> Ask about this
                  </Button>
                )}
                {onExplain && (
                  <Button size="sm" variant={text ? 'secondary' : 'primary'} disabled={loading} onClick={() => void goDeeper()} data-testid="explain-deeper">
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    {text ? 'Go deeper with AI' : 'Explain with AI'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
