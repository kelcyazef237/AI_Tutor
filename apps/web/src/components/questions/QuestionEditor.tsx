import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Eye, Loader2, PencilLine, Plus, Save, Trash2, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ArtifactKind,
  CONCEPT_BY_ID,
  DIFFICULTIES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  QuestionInput,
  type QuestionDef,
  type QuestionRecordDTO,
  type QuestionType,
} from '@psc/shared';
import { Markdown } from '@/components/Markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ConceptSelect, FieldError, SOURCE_LABEL, SOURCE_TONE, selectThemed } from './shared';

export type EditorState = { mode: 'new' } | { mode: 'edit'; record: QuestionRecordDTO } | null;

type ArtifactKindT = ArtifactKind;
const ARTIFACT_KINDS = ArtifactKind.options;
const DEPTH_LABEL: Record<number, string> = { 1: '1 · Recall', 2: '2 · Apply', 3: '3 · Reason' };

interface Form {
  conceptId: string;
  type: QuestionType;
  difficulty: number;
  prompt: string;
  hasArtifact: boolean;
  artifact: { kind: ArtifactKindT; language: string; title: string; content: string };
  objective: string;
  estMinutes: string;
  depth: number;
  secondaryConcepts: string[];
  keyPoints: string[];
  misconceptions: string[];
  referenceAnswer: string;
}

function toForm(q?: QuestionDef): Form {
  return {
    conceptId: q?.conceptId ?? '',
    type: q?.type ?? 'conceptual',
    difficulty: q?.difficulty ?? 2,
    prompt: q?.prompt ?? '',
    hasArtifact: !!q?.artifact,
    artifact: {
      kind: q?.artifact?.kind ?? 'code',
      language: q?.artifact?.language ?? '',
      title: q?.artifact?.title ?? '',
      content: q?.artifact?.content ?? '',
    },
    objective: q?.objective ?? '',
    estMinutes: String(q?.estMinutes ?? 3),
    depth: q?.depth ?? 2,
    secondaryConcepts: q?.secondaryConcepts ?? [],
    keyPoints: q?.rubric.keyPoints.length ? q.rubric.keyPoints : [''],
    misconceptions: q?.rubric.misconceptions ?? [],
    referenceAnswer: q?.rubric.referenceAnswer ?? '',
  };
}

function toCandidate(f: Form, id?: string) {
  const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  const opt = (s: string) => (s.trim() ? s.trim() : undefined);
  return {
    ...(id ? { id } : {}),
    conceptId: f.conceptId,
    secondaryConcepts: f.secondaryConcepts,
    type: f.type,
    difficulty: f.difficulty,
    prompt: f.prompt,
    artifact: f.hasArtifact ? { kind: f.artifact.kind, language: opt(f.artifact.language), title: opt(f.artifact.title), content: f.artifact.content } : undefined,
    objective: f.objective.trim(),
    depth: f.depth,
    estMinutes: f.estMinutes.trim() === '' ? undefined : Number(f.estMinutes),
    rubric: { keyPoints: clean(f.keyPoints), misconceptions: clean(f.misconceptions), referenceAnswer: f.referenceAnswer.trim() },
  };
}

type Errors = Record<string, string>;

function validate(f: Form, id?: string): { ok: true; data: QuestionInput } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  const r = QuestionInput.safeParse(toCandidate(f, id));
  if (!r.success) {
    for (const issue of r.error.issues) {
      const key = issue.path.map(String).join('.') || '_';
      errors[key] ??= issue.message;
    }
  }
  // Checks the schema allows but a usable question needs.
  if (!f.conceptId) errors.conceptId = 'Pick the concept this question assesses';
  if (!f.prompt.trim()) errors.prompt ??= 'The question text is required';
  if (!f.objective.trim()) errors.objective ??= 'Describe what the question checks';
  if (f.hasArtifact && !f.artifact.content.trim()) errors['artifact.content'] ??= 'Artifact content is empty (turn the artifact off if you do not need one)';
  if (!f.keyPoints.some((k) => k.trim())) errors['rubric.keyPoints'] ??= 'Add at least one key point so answers can be graded';
  const unknown = f.secondaryConcepts.filter((c) => !CONCEPT_BY_ID[c]);
  if (unknown.length) errors.secondaryConcepts ??= `Unknown concept id${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`;
  if (Object.keys(errors).length || !r.success) return { ok: false, errors };
  return { ok: true, data: r.data };
}

const errFor = (errors: Errors, key: string) => errors[key] ?? Object.entries(errors).find(([k]) => k.startsWith(`${key}.`))?.[1];

/* ── Small pieces ───────────────────────────────────────────── */

function Field({ label, hint, error, htmlFor, children, className }: { label: string; hint?: ReactNode; error?: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <Label htmlFor={htmlFor} hint={hint}>
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-medium uppercase tracking-wider text-faint">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function ListEditor({ items, onChange, placeholder, addLabel, label }: { items: string[]; onChange: (xs: string[]) => void; placeholder: string; addLabel: string; label: string }) {
  return (
    <div className="space-y-2">
      {items.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-faint">{i + 1}.</span>
          <Input
            value={v}
            aria-label={`${label} ${i + 1}`}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (i === items.length - 1) onChange([...items, '']);
              }
            }}
            className="min-w-0 flex-1"
          />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...items, ''])}>
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}

function SecondaryConcepts({ value, onChange, exclude }: { value: string[]; onChange: (xs: string[]) => void; exclude: string }) {
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const c = CONCEPT_BY_ID[id];
            return (
              <Badge key={id} tone={c ? 'neutral' : 'danger'} className="py-1 pr-1" title={id}>
                {c ? c.name : id}
                <button type="button" className="rounded p-0.5 hover:bg-border" aria-label={`Remove ${c?.name ?? id}`} onClick={() => onChange(value.filter((x) => x !== id))}>
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      <ConceptSelect
        value=""
        placeholder="Add a related concept…"
        aria-label="Add secondary concept"
        exclude={[...value, exclude]}
        onChange={(e) => e.target.value && onChange([...value, e.target.value])}
      />
    </div>
  );
}

/* ── Editor body (remounted per open) ───────────────────────── */

function EditorBody({ state, onClose }: { state: Exclude<EditorState, null>; onClose: () => void }) {
  const record = state.mode === 'edit' ? state.record : null;
  const qc = useQueryClient();
  const uid = useId();
  const [form, setForm] = useState<Form>(() => toForm(record?.question));
  const [errors, setErrors] = useState<Errors>({});
  const [preview, setPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setArt = (patch: Partial<Form['artifact']>) => setForm((f) => ({ ...f, artifact: { ...f.artifact, ...patch } }));
  const e = (k: string) => errFor(errors, k);

  const save = useMutation({
    mutationFn: (data: QuestionInput) => (record ? api.updateQuestion(record.id, data) : api.createQuestion(data)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['questions'] });
      toast.success(record ? 'Question updated' : 'Question created');
      onClose();
    },
    onError: (err: Error) => toast.error(record ? 'Could not save the question' : 'Could not create the question', { description: err.message }),
  });

  const del = useMutation({
    mutationFn: () => api.deleteQuestion(record!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['questions'] });
      toast.success('Question deleted');
      onClose();
    },
    onError: (err: Error) => toast.error('Could not delete the question', { description: err.message }),
  });

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const r = validate(form, record?.id);
    if (!r.ok) {
      setErrors(r.errors);
      const n = Object.keys(r.errors).length;
      toast.error(`Fix ${n} field${n > 1 ? 's' : ''} before saving`);
      return;
    }
    setErrors({});
    save.mutate(r.data);
  }

  const busy = save.isPending || del.isPending;
  const id = (s: string) => `${uid}-${s}`;
  const unmatched = Object.entries(errors).filter(
    ([k]) => !['conceptId', 'type', 'difficulty', 'prompt', 'artifact', 'objective', 'estMinutes', 'depth', 'secondaryConcepts', 'rubric'].some((p) => k === p || k.startsWith(`${p}.`)),
  );

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-border p-5">
        <div className="min-w-0 flex-1">
          <Dialog.Description className="text-xs text-faint">
            {record ? (
              <>
                {record.timesAsked ? `Asked ${record.timesAsked}×` : 'Never asked'} · added {new Date(record.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </>
            ) : (
              'Written by you. Saved as a custom question.'
            )}
          </Dialog.Description>
          <Dialog.Title className="mt-0.5 text-lg font-semibold">{record ? 'Edit question' : 'New question'}</Dialog.Title>
          {record && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={SOURCE_TONE[record.source]}>{SOURCE_LABEL[record.source]}</Badge>
              <code className="truncate rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">{record.id}</code>
            </div>
          )}
        </div>
        <Dialog.Close asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Close">
            <X />
          </Button>
        </Dialog.Close>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto p-5">
        {record && (record.source === 'generated' || record.source === 'followup') && (
          <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
            This question was written by the AI. You can keep, edit or delete it; edits change this saved copy only.
          </p>
        )}

        <Section title="Classification">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Concept" htmlFor={id('concept')} error={e('conceptId')} className="sm:col-span-2">
              <ConceptSelect id={id('concept')} value={form.conceptId} placeholder="Select a concept…" onChange={(ev) => set('conceptId', ev.target.value)} />
            </Field>
            <Field label="Question type" htmlFor={id('type')} error={e('type')}>
              <Select id={id('type')} className={selectThemed} value={form.type} onChange={(ev) => set('type', ev.target.value as QuestionType)}>
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {QUESTION_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Difficulty" htmlFor={id('difficulty')} error={e('difficulty')}>
              <Select id={id('difficulty')} className={selectThemed} value={form.difficulty} onChange={(ev) => set('difficulty', Number(ev.target.value))}>
                {DIFFICULTIES.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {i + 1} · {d.charAt(0) + d.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Depth" hint="How far past recall the answer must go." htmlFor={id('depth')} error={e('depth')}>
              <Select id={id('depth')} className={selectThemed} value={form.depth} onChange={(ev) => set('depth', Number(ev.target.value))}>
                {[1, 2, 3].map((d) => (
                  <option key={d} value={d}>
                    {DEPTH_LABEL[d]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estimated minutes" hint="1–30" htmlFor={id('est')} error={e('estMinutes')}>
              <Input id={id('est')} type="number" inputMode="numeric" min={1} max={30} value={form.estMinutes} onChange={(ev) => set('estMinutes', ev.target.value)} />
            </Field>
            <Field label="Secondary concepts" hint="Other concepts an answer also exercises (optional)." error={e('secondaryConcepts')} className="sm:col-span-2">
              <SecondaryConcepts value={form.secondaryConcepts} exclude={form.conceptId} onChange={(xs) => set('secondaryConcepts', xs)} />
            </Field>
          </div>
        </Section>

        <Section
          title="Question"
          action={
            <div role="radiogroup" aria-label="Prompt view" className="flex rounded-lg border border-border bg-surface-2 p-0.5">
              {[
                { v: false, label: 'Write', icon: PencilLine },
                { v: true, label: 'Preview', icon: Eye },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={preview === o.v}
                  onClick={() => setPreview(o.v)}
                  className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted hover:text-text', preview === o.v && 'bg-surface text-text shadow-card')}
                >
                  <o.icon className="size-3.5" /> {o.label}
                </button>
              ))}
            </div>
          }
        >
          <Field label="Prompt" hint="Markdown is supported." htmlFor={id('prompt')} error={e('prompt')}>
            {preview ? (
              <div className="min-h-40 rounded-lg border border-border bg-bg/50 p-3">
                {form.prompt.trim() ? <Markdown>{form.prompt}</Markdown> : <p className="text-sm text-faint">Nothing to preview yet.</p>}
              </div>
            ) : (
              <Textarea id={id('prompt')} rows={7} value={form.prompt} placeholder="Question text (Markdown)" onChange={(ev) => set('prompt', ev.target.value)} />
            )}
          </Field>
          <Field label="Objective" hint="What this question checks, in one sentence." htmlFor={id('objective')} error={e('objective')}>
            <Input id={id('objective')} value={form.objective} placeholder="What the learner should demonstrate" onChange={(ev) => set('objective', ev.target.value)} />
          </Field>
        </Section>

        <Section
          title="Artifact"
          action={
            <label className="flex items-center gap-2 text-xs text-muted">
              Include an artifact
              <Switch checked={form.hasArtifact} onCheckedChange={(v) => set('hasArtifact', v)} aria-label="Include an artifact" />
            </label>
          }
        >
          {form.hasArtifact ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Kind" htmlFor={id('akind')} error={e('artifact.kind')}>
                <Select id={id('akind')} className={selectThemed} value={form.artifact.kind} onChange={(ev) => setArt({ kind: ev.target.value as ArtifactKindT })}>
                  {ARTIFACT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Language" hint="Optional" htmlFor={id('alang')} error={e('artifact.language')}>
                <Input id={id('alang')} value={form.artifact.language} placeholder="e.g. python" onChange={(ev) => setArt({ language: ev.target.value })} />
              </Field>
              <Field label="Title" hint="Optional" htmlFor={id('atitle')} error={e('artifact.title')}>
                <Input id={id('atitle')} value={form.artifact.title} placeholder="Short caption" onChange={(ev) => setArt({ title: ev.target.value })} />
              </Field>
              <Field label="Content" htmlFor={id('acontent')} error={e('artifact.content')} className="sm:col-span-3">
                <Textarea
                  id={id('acontent')}
                  rows={8}
                  spellCheck={false}
                  value={form.artifact.content}
                  placeholder="Code, output or log the question refers to"
                  onChange={(ev) => setArt({ content: ev.target.value })}
                  className="font-mono text-xs leading-5"
                />
              </Field>
            </div>
          ) : (
            <p className="text-sm text-faint">No artifact. Turn this on to attach code, terminal output, a request, a log or a config the question refers to.</p>
          )}
        </Section>

        <Section title="Rubric">
          <p className="-mt-2 text-xs text-muted">Used to grade answers. With the AI offline, you grade yourself against these points.</p>
          <Field label="Key points" hint="What a strong answer must contain. Press Enter to add a row." error={e('rubric.keyPoints')}>
            <ListEditor items={form.keyPoints} onChange={(xs) => set('keyPoints', xs)} placeholder="What a strong answer must contain" addLabel="Add key point" label="Key point" />
          </Field>
          <Field label="Misconceptions" hint="Mistakes to watch for (optional)." error={e('rubric.misconceptions')}>
            <ListEditor items={form.misconceptions} onChange={(xs) => set('misconceptions', xs)} placeholder="A common wrong belief" addLabel="Add misconception" label="Misconception" />
          </Field>
          <Field label="Reference answer" hint="Markdown. Shown after grading." htmlFor={id('ref')} error={e('rubric.referenceAnswer')}>
            <Textarea id={id('ref')} rows={5} value={form.referenceAnswer} placeholder="A model answer" onChange={(ev) => set('referenceAnswer', ev.target.value)} />
          </Field>
        </Section>

        {unmatched.length > 0 && (
          <div className="rounded-lg bg-danger-soft p-3 text-xs text-danger">
            {unmatched.map(([k, m]) => (
              <p key={k}>
                {k}: {m}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4 sm:px-5">
        {confirmDelete ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-danger">
              <AlertTriangle className="size-4 shrink-0" /> Delete this question permanently?
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)} disabled={del.isPending}>
                Keep it
              </Button>
              <Button type="button" variant="danger" onClick={() => del.mutate()} disabled={del.isPending}>
                {del.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {record && (
              <Button type="button" variant="ghost" className="text-danger hover:text-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 /> <span className="hidden sm:inline">Delete</span>
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary" disabled={busy}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={busy}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} {record ? 'Save' : 'Create'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

export function QuestionEditor({ state, onClose }: { state: EditorState; onClose: () => void }) {
  const key = state ? (state.mode === 'edit' ? state.record.id : 'new') : 'closed';
  return (
    <Dialog.Root open={!!state} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-border bg-surface shadow-2xl outline-none"
          onInteractOutside={(ev) => ev.preventDefault()}
        >
          {state && <EditorBody key={key} state={state} onClose={onClose} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
