import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardPaste, FileJson, Loader2, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArtifactKind, DIFFICULTIES, QUESTION_TYPES, type ImportResultDTO } from '@psc/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Field names and placeholder values only — no example content. */
const FORMAT_REFERENCE = `{
  "questions": [
    {
      "id": "<optional; reuse an id to update that question>",
      "conceptId": "<concept id from the Skill Map, e.g. net.tcp>",
      "secondaryConcepts": ["<optional concept id>"],
      "type": "<question type, see below>",
      "difficulty": 2,
      "depth": 2,
      "estMinutes": 3,
      "prompt": "<your question in Markdown>",
      "objective": "<what the question checks>",
      "artifact": {
        "kind": "<${ArtifactKind.options.join(' | ')}>",
        "language": "<optional>",
        "title": "<optional>",
        "content": "<optional block the question refers to>"
      },
      "rubric": {
        "keyPoints": ["<what a strong answer must contain>"],
        "misconceptions": ["<optional common mistake>"],
        "referenceAnswer": "<model answer in Markdown>"
      }
    }
  ]
}`;

type Parsed = { ok: true; items: unknown[] } | { ok: false; message: string } | null;

function parse(text: string): Parsed {
  if (!text.trim()) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, message: `Not valid JSON: ${(e as Error).message}` };
  }
  if (Array.isArray(data)) return { ok: true, items: data };
  if (data && typeof data === 'object' && Array.isArray((data as { questions?: unknown }).questions)) return { ok: true, items: (data as { questions: unknown[] }).questions };
  return { ok: false, message: 'Expected an array of questions, or an object with a "questions" array.' };
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResultDTO | null>(null);
  const [showRef, setShowRef] = useState(false);

  const parsed = useMemo(() => parse(text), [text]);

  const imp = useMutation({
    mutationFn: (items: unknown[]) => api.importQuestions(items),
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: ['questions'] });
      const n = r.imported + r.updated;
      if (n) toast.success(`Imported ${r.imported}, updated ${r.updated}`);
      else toast.error('No questions were imported');
    },
    onError: (e: Error) => toast.error('Import failed', { description: e.message }),
  });

  function reset() {
    setText('');
    setFileName(null);
    setResult(null);
    imp.reset();
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      setText(await f.text());
      setFileName(f.name);
      setResult(null);
    } catch {
      toast.error('Could not read that file');
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-surface shadow-2xl outline-none">
          <div className="flex items-start gap-3 border-b border-border p-5">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">Import questions</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted">
                Load a JSON file of your own questions. Questions with an existing <code className="font-mono text-xs">id</code> are updated; the rest are added.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X />
              </Button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            {result ? (
              <ImportResult result={result} />
            ) : (
              <>
                <div role="radiogroup" aria-label="Import source" className="flex w-fit rounded-lg border border-border bg-surface-2 p-0.5">
                  {(
                    [
                      { id: 'file', label: 'Upload file', icon: Upload },
                      { id: 'paste', label: 'Paste JSON', icon: ClipboardPaste },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.id}
                      role="radio"
                      aria-checked={mode === o.id}
                      onClick={() => setMode(o.id)}
                      className={cn('flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted hover:text-text', mode === o.id && 'bg-surface text-text shadow-card')}
                    >
                      <o.icon className="size-3.5" /> {o.label}
                    </button>
                  ))}
                </div>

                {mode === 'file' ? (
                  <div>
                    <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} tabIndex={-1} aria-hidden />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        void onFile(e.dataTransfer.files[0]);
                      }}
                      className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-bg/50 px-4 py-8 text-center transition-colors hover:border-accent hover:bg-accent-soft/40"
                    >
                      <FileJson className="size-7 text-accent" />
                      <span className="text-sm font-medium text-text">{fileName ?? 'Choose a .json file'}</span>
                      <span className="text-xs text-muted">{fileName ? 'Click to pick a different file' : 'or drop it here'}</span>
                    </button>
                  </div>
                ) : (
                  <Textarea
                    rows={10}
                    spellCheck={false}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setFileName(null);
                    }}
                    placeholder='[ { "conceptId": "…", "type": "…", … } ]'
                    aria-label="Questions JSON"
                    className="font-mono text-xs leading-5"
                  />
                )}

                {parsed && (
                  <p className={cn('flex items-center gap-2 text-sm', parsed.ok ? 'text-muted' : 'text-danger')}>
                    {parsed.ok ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <AlertTriangle className="size-4 shrink-0" />}
                    {parsed.ok ? `${parsed.items.length} question${parsed.items.length === 1 ? '' : 's'} found. Each one is validated on import.` : parsed.message}
                  </p>
                )}

                <div className="rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setShowRef((s) => !s)}
                    aria-expanded={showRef}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium hover:bg-surface-2"
                  >
                    Format reference
                    <span className="text-xs font-normal text-faint">{showRef ? 'Hide' : 'Show'}</span>
                  </button>
                  {showRef && (
                    <div className="space-y-3 border-t border-border p-3 text-xs text-muted">
                      <p>
                        A top-level array of questions also works. Only <code className="font-mono">conceptId</code>, <code className="font-mono">type</code>,{' '}
                        <code className="font-mono">difficulty</code>, <code className="font-mono">prompt</code>, <code className="font-mono">objective</code> and{' '}
                        <code className="font-mono">rubric</code> are required.
                      </p>
                      <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-4 text-text">{FORMAT_REFERENCE}</pre>
                      <p>
                        <span className="font-medium text-text">difficulty</span> 1–5 ({DIFFICULTIES.map((d) => d.toLowerCase()).join(', ')}) ·{' '}
                        <span className="font-medium text-text">depth</span> 1–3 · <span className="font-medium text-text">estMinutes</span> 1–30
                      </p>
                      <p>
                        <span className="font-medium text-text">type</span>: {QUESTION_TYPES.join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border p-4 sm:px-5">
            {result ? (
              <>
                <Button variant="secondary" onClick={reset}>
                  Import more
                </Button>
                <Dialog.Close asChild>
                  <Button>Done</Button>
                </Dialog.Close>
              </>
            ) : (
              <>
                <Dialog.Close asChild>
                  <Button variant="secondary">Cancel</Button>
                </Dialog.Close>
                <Button disabled={!parsed?.ok || parsed.items.length === 0 || imp.isPending} onClick={() => parsed?.ok && imp.mutate(parsed.items)}>
                  {imp.isPending ? <Loader2 className="animate-spin" /> : <Upload />} Import
                </Button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ImportResult({ result }: { result: ImportResultDTO }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Imported', value: result.imported, cls: 'text-success' },
          { label: 'Updated', value: result.updated, cls: 'text-accent' },
          { label: 'Rejected', value: result.errors.length, cls: result.errors.length ? 'text-danger' : 'text-muted' },
        ].map((s) => (
          <div key={s.label} className="min-w-0 rounded-lg border border-border p-3">
            <div className="text-xs text-muted">{s.label}</div>
            <div className={cn('mt-1 text-2xl font-semibold tabular-nums', s.cls)}>{s.value}</div>
          </div>
        ))}
      </div>
      {result.errors.length > 0 ? (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">Problems</h4>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {result.errors.map((e, i) => (
              <li key={i} className="flex items-start gap-3 px-3 py-2 text-sm">
                <Badge tone="danger" className="shrink-0 tabular-nums">
                  #{e.index + 1}
                </Badge>
                <span className="min-w-0 break-words text-muted">{e.message}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-faint">Numbers are positions in your file, starting at 1. The other entries are already saved, so re-import only the fixed ones (or give every question an id so re-importing updates instead of duplicating).</p>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted">
          <CheckCircle2 className="size-4 text-success" /> Every question was accepted.
        </p>
      )}
    </div>
  );
}
