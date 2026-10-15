import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Eraser, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { DiagramChatMessageDTO } from '@psc/shared';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ChatFocus {
  kind: 'node' | 'edge';
  id: string;
  label: string;
}

const SUGGESTIONS = ['Walk me through the overall flow in plain terms.', 'What would an attacker try first here, and why?', 'Quiz me: ask me one question about this diagram.'];

/**
 * Saved conversation about one diagram. Grounded in the diagram spec on the
 * server; history persists per diagram. Can be opened focused on an element
 * (from the label popup) so the first question carries that context.
 */
export function ChatDrawer({
  diagramId,
  diagramTitle,
  open,
  onClose,
  focus,
  onClearFocus,
}: {
  diagramId: string;
  diagramTitle: string;
  open: boolean;
  onClose: () => void;
  focus: ChatFocus | null;
  onClearFocus: () => void;
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const key = ['diagram-chat', diagramId];
  const chatQ = useQuery({ queryKey: key, queryFn: () => api.diagramChat(diagramId), enabled: open, retry: false });
  const messages: DiagramChatMessageDTO[] = chatQ.data ?? [];

  const send = useMutation({
    mutationFn: (message: string) => api.askDiagram(diagramId, { message, focus: focus ? { kind: focus.kind, id: focus.id } : undefined }),
    onSuccess: (list) => {
      qc.setQueryData(key, list);
      setInput('');
      onClearFocus();
    },
    onError: (e: Error) => toast.error('The companion could not answer', { description: e.message }),
  });

  const clear = useMutation({
    mutationFn: () => api.clearDiagramChat(diagramId),
    onSuccess: () => qc.setQueryData(key, []),
    onError: (e: Error) => toast.error('Could not clear the chat', { description: e.message }),
  });

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [open, messages.length, send.isPending]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface shadow-2xl outline-none sm:max-w-md">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
                <Bot className="size-[18px]" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="truncate text-sm font-semibold">Ask about this diagram</Dialog.Title>
                <Dialog.Description className="truncate text-xs text-muted">{diagramTitle}</Dialog.Description>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {messages.length > 0 && (
                <Button variant="ghost" size="icon" onClick={() => clear.mutate()} disabled={clear.isPending} aria-label="Clear chat" title="Clear this chat">
                  <Eraser className="size-4" />
                </Button>
              )}
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close chat">
                  <X className="size-4" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          {/* Messages */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
            {chatQ.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin text-accent" /> Loading the conversation…
              </div>
            )}
            {!chatQ.isLoading && messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Go past the labels — ask why something happens, what an attacker would do, what breaks if a piece changes. The conversation is saved with this diagram.
                </p>
                <div className="flex flex-col items-start gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="rounded-full border border-border px-3 py-1.5 text-left text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                    >
                      <Sparkles className="mr-1 inline size-3" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm text-accent-fg">
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-2.5">
                  <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
                    <Bot className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 text-sm [&_p]:leading-relaxed">
                    <Markdown>{m.content}</Markdown>
                  </div>
                </div>
              ),
            )}
            {send.isPending && (
              <div className="flex items-center gap-2.5 text-sm text-muted">
                <div className="grid size-6 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
                  <Bot className="size-3.5" />
                </div>
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin text-accent" /> Thinking…
                </span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Composer */}
          <form onSubmit={submit} className="border-t border-border p-3">
            {focus && (
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft/50 px-2.5 py-1 text-xs text-accent">
                  <span className="truncate">About: {focus.label}</span>
                  <button type="button" onClick={onClearFocus} aria-label="Remove focus" className="shrink-0 opacity-70 hover:opacity-100">
                    <X className="size-3" />
                  </button>
                </span>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={2}
                maxLength={2000}
                placeholder="Ask anything about this diagram…"
                aria-label="Message"
                className="min-h-11 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-base text-text placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] sm:text-sm"
              />
              <Button type="submit" size="icon" className={cn('mb-0.5 size-10 shrink-0')} disabled={!input.trim() || send.isPending} aria-label="Send">
                <Send className="size-4" />
              </Button>
            </div>
            <p className="mt-1.5 text-[10px] text-faint">Enter to send · Shift+Enter for a new line · the chat is saved with this diagram</p>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
