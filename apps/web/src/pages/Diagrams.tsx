import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, Plus, RotateCcw, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DIAGRAM_ICONS,
  DIAGRAM_TOPICS,
  type DiagramDTO,
  type DiagramLayoutOverrides,
  type DiagramSpec,
  type DiagramSummaryDTO,
  type DiagramTopic,
} from '@psc/shared';
import { DiagramCanvas, type DiagramSelection } from '@/components/diagram/DiagramCanvas';
import { ChatDrawer, type ChatFocus } from '@/components/diagram/ChatDrawer';
import type { ExplainTarget } from '@/components/diagram/ExplainDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const EMPTY_LAYOUT: DiagramLayoutOverrides = { nodes: {}, zones: {} };
const SAVE_DEBOUNCE_MS = 700;

function relTime(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

/* ── Topic gallery (one click = one diagram) ─────────────────── */

function TopicButton({ topic, busy, onPick }: { topic: DiagramTopic; busy: boolean; onPick: (t: DiagramTopic) => void }) {
  return (
    <button
      disabled={busy}
      onClick={() => onPick(topic)}
      className={cn(
        'group flex h-full flex-col rounded-xl border border-border bg-surface p-4 text-left shadow-card transition-all',
        'hover:border-accent hover:bg-accent-soft/30 disabled:pointer-events-none disabled:opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{topic.title}</span>
        <ArrowRight className="size-4 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-accent" />
      </div>
      <p className="mt-1 flex-1 text-xs text-muted">{topic.blurb}</p>
    </button>
  );
}

function TopicGallery({ busy, onPick }: { busy: boolean; onPick: (t: DiagramTopic) => void }) {
  return (
    <div className="space-y-6">
      {DIAGRAM_TOPICS.map((g) => (
        <section key={g.id}>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">{g.name}</h3>
            <span className="text-xs text-faint">{g.blurb}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {g.topics.map((t) => (
              <TopicButton key={t.id} topic={t} busy={busy} onPick={onPick} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── Launchpad when nothing is selected ──────────────────────── */

function Launchpad({ prompt, setPrompt, generating, onGenerate, onPick }: {
  prompt: string;
  setPrompt: (v: string) => void;
  generating: boolean;
  onGenerate: () => void;
  onPick: (t: DiagramTopic) => void;
}) {
  return (
    <div className="space-y-8">
      <Card className="overflow-hidden border-accent/30 bg-gradient-to-br from-accent-soft/60 to-surface">
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg">
              <Wand2 className="size-5" />
            </div>
            <div>
              <div className="font-semibold">Prompt a diagram</div>
              <p className="text-sm text-muted">Describe the concept — the engine designs an animated, step-by-step topology you can replay, trace, rearrange and refine.</p>
            </div>
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder='e.g. "Kerberos delegation in a two-forest setup — show constrained vs unconstrained" or "how my browser reaches a K8s pod"'
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" disabled={generating || !prompt.trim()} onClick={onGenerate}>
              {generating ? <Loader2 className="animate-spin" /> : <Sparkles />} {generating ? 'Designing…' : 'Generate diagram'}
            </Button>
            <span className="text-xs text-faint">or pick a curated topic — one click builds it</span>
          </div>
        </div>
      </Card>

      <TopicGallery busy={generating} onPick={onPick} />
    </div>
  );
}

/* ── Library ─────────────────────────────────────────────────── */

function Library({ items, selectedId, onOpen, loading }: {
  items: DiagramSummaryDTO[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }
  if (!items.length) return <p className="py-4 text-center text-sm text-faint">Diagrams you generate are kept here.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((d) => (
        <li key={d.id}>
          <button
            onClick={() => onOpen(d.id)}
            className={cn(
              'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
              d.id === selectedId ? 'border-accent bg-accent-soft/40' : 'border-border hover:border-border-strong hover:bg-surface-2',
            )}
          >
            <div className="truncate text-sm font-medium">{d.title}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-faint">
              <span>{d.stepCount} steps</span>
              <span>·</span>
              <span>{d.nodeCount} nodes</span>
              <span>·</span>
              <span>{relTime(d.updatedAt)}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── Label inspector ─────────────────────────────────────────── */

function Inspector({ spec, layout, selection, onSpec, onMove, onClose }: {
  spec: DiagramSpec;
  layout: DiagramLayoutOverrides;
  selection: Exclude<DiagramSelection, null>;
  onSpec: (fn: (s: DiagramSpec) => DiagramSpec) => void;
  onMove: (layout: DiagramLayoutOverrides) => void;
  onClose: () => void;
}) {
  const node = selection.kind === 'node' ? spec.nodes.find((n) => n.id === selection.id) : undefined;
  const edge = selection.kind === 'edge' ? spec.edges.find((e) => e.id === selection.id) : undefined;
  const zone = selection.kind === 'zone' ? spec.zones.find((z) => z.id === selection.id) : undefined;

  const pinned = selection.kind === 'node' ? layout.nodes[selection.id] : selection.kind === 'zone' ? layout.zones[selection.id] : undefined;
  const resetPosition = () => {
    if (selection.kind === 'node') {
      const { [selection.id]: _drop, ...rest } = layout.nodes;
      onMove({ nodes: rest, zones: layout.zones });
    } else if (selection.kind === 'zone') {
      const { [selection.id]: _drop, ...rest } = layout.zones;
      onMove({ nodes: layout.nodes, zones: rest });
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-accent/40 bg-accent-soft/25 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-accent">
          {node ? 'Edit component' : edge ? 'Edit connection label' : 'Edit zone'}
          <span className="ml-2 font-mono normal-case tracking-normal text-faint">{selection.id}</span>
        </div>
        <div className="flex items-center gap-1">
          {pinned && (
            <Button variant="ghost" size="sm" onClick={resetPosition} title="Return this item to its automatic position">
              <RotateCcw className="size-3.5" /> Auto position
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Close editor">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {node && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Title</Label>
            <Input value={node.title} maxLength={46} onChange={(e) => onSpec((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === node.id ? { ...n, title: e.target.value } : n)) }))} />
          </div>
          <div>
            <Label>Detail line</Label>
            <Input
              value={node.sub ?? ''}
              maxLength={72}
              placeholder="(none)"
              onChange={(e) => {
                const v = e.target.value;
                onSpec((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === node.id ? { ...n, sub: v.trim() ? v : undefined } : n)) }));
              }}
            />
          </div>
          <div>
            <Label>Tags <span className="font-normal text-faint">· comma-separated</span></Label>
            <Input
              value={node.tags.join(', ')}
              placeholder="10.0.0.5, :443"
              onChange={(e) => {
                const tags = e.target.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 4).map((t) => t.slice(0, 12));
                onSpec((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === node.id ? { ...n, tags } : n)) }));
              }}
            />
          </div>
          <div>
            <Label>Icon</Label>
            <Select value={node.icon} onChange={(e) => onSpec((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === node.id ? { ...n, icon: e.target.value as typeof n.icon } : n)) }))}>
              {DIAGRAM_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {edge && (
        <div className="max-w-sm">
          <Label>Connection label</Label>
          <Input
            value={edge.label ?? ''}
            maxLength={24}
            placeholder="(none)"
            onChange={(e) => {
              const v = e.target.value;
              onSpec((s) => ({ ...s, edges: s.edges.map((x) => (x.id === edge.id ? { ...x, label: v.trim() ? v : undefined } : x)) }));
            }}
          />
        </div>
      )}

      {zone && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Zone label</Label>
            <Input value={zone.label} maxLength={40} onChange={(e) => onSpec((s) => ({ ...s, zones: s.zones.map((z) => (z.id === zone.id ? { ...z, label: e.target.value } : z)) }))} />
          </div>
          <div>
            <Label>Zone subtitle</Label>
            <Input
              value={zone.sub ?? ''}
              maxLength={60}
              placeholder="(none)"
              onChange={(e) => {
                const v = e.target.value;
                onSpec((s) => ({ ...s, zones: s.zones.map((z) => (z.id === zone.id ? { ...z, sub: v.trim() ? v : undefined } : z)) }));
              }}
            />
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-faint">Changes and positions save automatically. The wires re-route themselves — they can’t break.</p>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */

interface Draft {
  id: string;
  spec: DiagramSpec;
  layout: DiagramLayoutOverrides;
}

export function DiagramsPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('d');
  const [prompt, setPrompt] = useState('');
  const [refineText, setRefineText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<DiagramSelection>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatFocus, setChatFocus] = useState<ChatFocus | null>(null);

  const listQ = useQuery({ queryKey: ['diagrams'], queryFn: api.diagrams, retry: false });
  const detailQ = useQuery({ queryKey: ['diagram', selectedId], queryFn: () => api.getDiagram(selectedId!), enabled: !!selectedId, retry: false });
  const detail: DiagramDTO | undefined = detailQ.data;

  /* Draft = the editable copy shown on the canvas. Autosaved (debounced). */
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const editSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerPending = useRef(false);
  const saving = useRef(false);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const doSave = useCallback(async () => {
    const d = draftRef.current;
    if (!d) return;
    timerPending.current = false;
    const seq = editSeq.current;
    saving.current = true;
    try {
      const res = await api.updateDiagram(d.id, { spec: d.spec, layout: d.layout });
      if (seq === editSeq.current) {
        saving.current = false;
        qc.setQueryData(['diagram', d.id], res);
        void qc.invalidateQueries({ queryKey: ['diagrams'] });
      }
    } catch (e) {
      saving.current = false;
      toast.error('Could not save your edits', { description: (e as Error).message });
    }
  }, [qc]);

  const scheduleSave = useCallback(() => {
    editSeq.current++;
    timerPending.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void doSave(), SAVE_DEBOUNCE_MS);
  }, [doSave]);

  // Flush pending edits if the page unmounts (e.g. navigating away quickly).
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const d = draftRef.current;
      if (d && (timerPending.current || saving.current)) {
        void api.updateDiagram(d.id, { spec: d.spec, layout: d.layout }).catch(() => {});
      }
    },
    [],
  );

  // Sync the draft from the server, but never clobber local edits in flight.
  useEffect(() => {
    if (!detail) return;
    setDraft((prev) => {
      const incoming: Draft = { id: detail.id, spec: detail.spec, layout: detail.layout };
      if (prev?.id === detail.id) {
        const same = JSON.stringify(prev.spec) === JSON.stringify(incoming.spec) && JSON.stringify(prev.layout) === JSON.stringify(incoming.layout);
        if (same) return prev;
        if (timerPending.current || saving.current) return prev;
      }
      return incoming;
    });
  }, [detail]);

  // Drop a selection that no longer exists (e.g. after a refine).
  useEffect(() => {
    if (!selection || !draft) return;
    const exists =
      selection.kind === 'node'
        ? draft.spec.nodes.some((n) => n.id === selection.id)
        : selection.kind === 'edge'
          ? draft.spec.edges.some((e) => e.id === selection.id)
          : draft.spec.zones.some((z) => z.id === selection.id);
    if (!exists) setSelection(null);
  }, [draft, selection]);

  const open = (id: string | null) => {
    setRefineText('');
    setEditing(false);
    setSelection(null);
    setChatOpen(false);
    setChatFocus(null);
    setParams(id ? { d: id } : {}, { replace: false });
  };

  const generate = useMutation({
    mutationFn: (body: { topic: string; prompt: string }) => api.generateDiagram(body),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['diagrams'] });
      qc.setQueryData(['diagram', d.id], d);
      setPrompt('');
      open(d.id);
    },
    onError: (e: Error) => toast.error('Could not build the diagram', { description: e.message }),
  });

  const refine = useMutation({
    mutationFn: (instruction: string) => api.refineDiagram(selectedId!, instruction),
    onSuccess: (d) => {
      if (timer.current) clearTimeout(timer.current);
      timerPending.current = false;
      saving.current = false;
      editSeq.current++;
      qc.setQueryData(['diagram', d.id], d);
      setDraft({ id: d.id, spec: d.spec, layout: d.layout });
      void qc.invalidateQueries({ queryKey: ['diagrams'] });
      setRefineText('');
    },
    onError: (e: Error) => toast.error('Refinement failed', { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteDiagram(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['diagrams'] });
      setConfirmDelete(false);
      open(null);
    },
    onError: (e: Error) => toast.error('Could not delete', { description: e.message }),
  });

  const updateSpec = (fn: (s: DiagramSpec) => DiagramSpec) => {
    setDraft((prev) => (prev ? { ...prev, spec: fn(prev.spec) } : prev));
    scheduleSave();
  };
  const moveLayout = (layout: DiagramLayoutOverrides) => {
    setDraft((prev) => (prev ? { ...prev, layout } : prev));
    scheduleSave();
  };

  /** Tap-a-label: fetch a plain-language explanation and remember it in the spec. */
  const requestExplain = async (t: ExplainTarget) => {
    const d = draftRef.current;
    if (!d) return null;
    const res = await api.explainDiagram(d.id, t);
    updateSpec((s) =>
      t.kind === 'node'
        ? { ...s, nodes: s.nodes.map((n) => (n.id === t.id ? { ...n, explain: res.explanation } : n)) }
        : { ...s, edges: s.edges.map((e) => (e.id === t.id ? { ...e, explain: res.explanation } : e)) },
    );
    return res.explanation;
  };

  /** Open the saved chat, optionally focused on an element the student tapped. */
  const openChat = (t: ExplainTarget | null) => {
    const s = draftRef.current?.spec;
    if (!s) return;
    if (t) {
      const label =
        t.kind === 'node'
          ? (s.nodes.find((n) => n.id === t.id)?.title ?? t.id)
          : (() => {
              const e = s.edges.find((x) => x.id === t.id);
              if (!e) return t.id;
              const from = s.nodes.find((n) => n.id === e.from)?.title ?? e.from;
              const to = s.nodes.find((n) => n.id === e.to)?.title ?? e.to;
              return `${e.label ? `${e.label}: ` : ''}${from} → ${to}`;
            })();
      setChatFocus({ kind: t.kind, id: t.id, label });
    } else {
      setChatFocus(null);
    }
    setChatOpen(true);
  };

  const onRefine = (e: FormEvent) => {
    e.preventDefault();
    const t = refineText.trim();
    if (t.length >= 2 && !refine.isPending) refine.mutate(t);
  };

  const generating = generate.isPending || refine.isPending;

  return (
    <>
      <PageHeader
        title="Diagram Studio"
        description="Prompt or pick a topic — get an animated, replayable explanation you can replay, rearrange and relabel."
        actions={
          selectedId ? (
            <Button variant="secondary" onClick={() => open(null)}>
              <Plus /> New diagram
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main column */}
        <div className="min-w-0">
          {!selectedId && (
            <Launchpad
              prompt={prompt}
              setPrompt={setPrompt}
              generating={generating}
              onGenerate={() => generate.mutate({ topic: '', prompt })}
              onPick={(t) => generate.mutate({ topic: t.id, prompt: '' })}
            />
          )}

          {selectedId && generating && (
            <Card className="p-6">
              <div className="flex items-center gap-3 text-sm text-muted">
                <Loader2 className="size-4 animate-spin text-accent" />
                {refine.isPending ? 'Applying your refinement…' : 'Designing the diagram — this can take a minute…'}
              </div>
              <div className="mt-4 space-y-3">
                <Skeleton className="h-64 rounded-xl sm:h-80" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            </Card>
          )}

          {selectedId && !generating && detailQ.isError && (
            <Card className="p-6 text-sm text-muted">
              This diagram could not be loaded.{' '}
              <button className="text-accent underline underline-offset-2" onClick={() => open(null)}>
                Back to the studio
              </button>
            </Card>
          )}

          {selectedId && !generating && draft && detail && (
            <div className="space-y-4">
              <Card className="p-4 sm:p-5">
                {/* Header */}
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold tracking-tight">{draft.spec.title}</h2>
                    {draft.spec.subtitle && <p className="mt-0.5 max-w-3xl text-sm text-muted">{draft.spec.subtitle}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                      <span>{draft.spec.steps.length} steps</span>
                      <span>·</span>
                      <span>{draft.spec.nodes.length} nodes</span>
                      {detail.model && (
                        <>
                          <span>·</span>
                          <span className="font-mono">{detail.model}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{relTime(detail.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Dialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
                      <Dialog.Trigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Delete diagram">
                          <Trash2 className="size-4" />
                        </Button>
                      </Dialog.Trigger>
                      <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
                        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-2xl outline-none">
                          <Dialog.Title className="text-base font-semibold">Delete this diagram?</Dialog.Title>
                          <Dialog.Description className="mt-1 text-sm text-muted">"{draft.spec.title}" will be removed from your library.</Dialog.Description>
                          <div className="mt-5 flex justify-end gap-2">
                            <Dialog.Close asChild>
                              <Button variant="ghost">Keep it</Button>
                            </Dialog.Close>
                            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(detail.id)}>
                              Delete
                            </Button>
                          </div>
                        </Dialog.Content>
                      </Dialog.Portal>
                    </Dialog.Root>
                  </div>
                </div>

                {/* Canvas */}
                <DiagramCanvas
                  key={detail.id}
                  spec={draft.spec}
                  editable
                  editing={editing}
                  onToggleEdit={setEditing}
                  overrides={draft.layout}
                  onMoveLayout={moveLayout}
                  onResetLayout={() => moveLayout(EMPTY_LAYOUT)}
                  selection={selection}
                  onSelect={setSelection}
                  onExplainRequest={requestExplain}
                  onAsk={openChat}
                />

                {/* Saved chat about this diagram */}
                <ChatDrawer diagramId={detail.id} diagramTitle={draft.spec.title} open={chatOpen} onClose={() => setChatOpen(false)} focus={chatFocus} onClearFocus={() => setChatFocus(null)} />

                {/* Label inspector (edit mode) */}
                {editing && selection && (
                  <Inspector spec={draft.spec} layout={draft.layout} selection={selection} onSpec={updateSpec} onMove={moveLayout} onClose={() => setSelection(null)} />
                )}

                {/* Refine */}
                <form onSubmit={onRefine} className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
                  <Input
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                    placeholder='Refine it: "add a firewall between DMZ and internal", "make step 3 show the packet fields"…'
                    aria-label="Refinement instruction"
                    maxLength={600}
                  />
                  <Button type="submit" disabled={refine.isPending || refineText.trim().length < 2} className="shrink-0">
                    {refine.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />} Refine
                  </Button>
                </form>
                {detail.refinements.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {detail.refinements.slice(0, 3).map((r, i) => (
                      <li key={i} className="truncate text-[11px] text-faint">
                        " {r.instruction} " · {relTime(r.at)}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className={cn('min-w-0 space-y-6', !selectedId && 'order-first lg:order-none')}>
          {selectedId && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Prompt a new diagram</h3>
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Describe the concept to diagram…" />
              <Button className="mt-2 w-full" disabled={generating || !prompt.trim()} onClick={() => generate.mutate({ topic: '', prompt })}>
                {generating ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate
              </Button>
            </Card>
          )}

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Library</h3>
            <Library items={listQ.data ?? []} selectedId={selectedId} onOpen={open} loading={listQ.isLoading} />
          </Card>
        </aside>
      </div>
    </>
  );
}
