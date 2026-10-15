import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, FileUp, Library, Loader2, Plus, RotateCcw, Search, SearchX, ServerOff, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CONCEPT_BY_ID, DOMAINS, QUESTION_SOURCES, QUESTION_TYPE_LABEL, difficultyName, type QuestionRecordDTO, type QuestionSource } from '@psc/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { ImportDialog } from '@/components/questions/ImportDialog';
import { QuestionEditor, type EditorState } from '@/components/questions/QuestionEditor';
import { SOURCE_LABEL, SOURCE_TONE, promptPreview, selectThemed } from '@/components/questions/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

/** Scope filter value: '' (all), 'd:<domainId>' or 'c:<conceptId>'. */
type Scope = string;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function QuestionRow({ r, onOpen }: { r: QuestionRecordDTO; onOpen: () => void }) {
  const q = r.question;
  const c = CONCEPT_BY_ID[q.conceptId];
  const preview = promptPreview(q.prompt);
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-start gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{c?.name ?? q.conceptId}</span>
            <span className="hidden shrink-0 text-xs text-faint sm:inline">{c?.domainName ?? 'Unknown domain'}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted">{preview || <span className="text-faint">No prompt</span>}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
            <Badge tone={SOURCE_TONE[r.source]}>{SOURCE_LABEL[r.source]}</Badge>
            <span>{QUESTION_TYPE_LABEL[q.type] ?? q.type}</span>
            <span aria-hidden>·</span>
            <span>{difficultyName(q.difficulty).toLowerCase()}</span>
            <span aria-hidden className="sm:hidden">
              ·
            </span>
            <span className="sm:hidden">{c?.domainName}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-medium tabular-nums">{r.timesAsked}×</div>
          <div className="text-xs text-faint">asked</div>
        </div>
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <Card className="divide-y divide-border overflow-hidden">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-4 px-4 py-3.5 sm:px-5">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-8 w-10" />
        </div>
      ))}
    </Card>
  );
}

export function QuestionsPage() {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'' | QuestionSource>('');
  const [scope, setScope] = useState<Scope>('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const q = useDebounced(search.trim(), 250);
  const conceptId = scope.startsWith('c:') ? scope.slice(2) : undefined;
  const domainId = scope.startsWith('d:') ? scope.slice(2) : undefined;

  const list = useQuery({
    queryKey: ['questions', { source, conceptId, q }],
    queryFn: () => api.questions({ source: source || undefined, conceptId, q: q || undefined }),
    placeholderData: keepPreviousData,
    retry: false,
  });

  // Domain filtering happens client-side (the API filters by single concept).
  const rows = useMemo(() => (list.data ?? []).filter((r) => !domainId || CONCEPT_BY_ID[r.question.conceptId]?.domainId === domainId), [list.data, domainId]);
  const filtered = !!(search.trim() || source || scope);

  async function exportAll() {
    setExporting(true);
    try {
      const data = await api.exportQuestions();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'questions.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Exported ${data.length} question${data.length === 1 ? '' : 's'}`, { description: 'Imported and custom questions only.' });
    } catch (e) {
      toast.error('Export failed', { description: (e as Error).message });
    } finally {
      setExporting(false);
    }
  }

  const offline = list.isError && !list.data;

  const header = (
    <PageHeader
      title="Questions"
      description="Your own question bank. Import a JSON file or write questions here; they're mixed into training sessions."
      actions={
        <>
          <Button variant="secondary" onClick={() => setImportOpen(true)} disabled={offline}>
            <FileUp /> <span className="hidden min-[400px]:inline">Import JSON</span>
            <span className="min-[400px]:hidden">Import</span>
          </Button>
          <Button variant="secondary" onClick={() => void exportAll()} disabled={offline || exporting}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export
          </Button>
          <Button onClick={() => setEditor({ mode: 'new' })} disabled={offline}>
            <Plus /> New<span className="hidden min-[400px]:inline"> question</span>
          </Button>
        </>
      }
    />
  );

  const dialogs = (
    <>
      <QuestionEditor state={editor} onClose={() => setEditor(null)} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );

  if (offline) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={ServerOff}
            title="Questions unavailable"
            action={
              <Button variant="secondary" onClick={() => void list.refetch()} disabled={list.isFetching}>
                {list.isFetching ? <Loader2 className="animate-spin" /> : <RotateCcw />} Retry
              </Button>
            }
          >
            {(list.error as Error).message}
          </EmptyState>
        </Card>
      </>
    );
  }

  return (
    <>
      {header}

      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions…" aria-label="Search questions" className="pl-9 pr-9" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-text" aria-label="Clear search">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select value={source} onChange={(e) => setSource(e.target.value as '' | QuestionSource)} className={`min-w-0 sm:w-auto ${selectThemed}`} aria-label="Source">
          <option value="">All sources</option>
          {QUESTION_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={scope} onChange={(e) => setScope(e.target.value)} className={`min-w-0 sm:w-56 ${selectThemed}`} aria-label="Domain or concept">
          <option value="">All domains</option>
          {DOMAINS.map((d) => (
            <optgroup key={d.id} label={d.name}>
              <option value={`d:${d.id}`}>All of {d.name}</option>
              {d.concepts.map((c) => (
                <option key={c.id} value={`c:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      {!list.data ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState
              icon={SearchX}
              title="No questions match"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setSource('');
                    setScope('');
                  }}
                >
                  Clear filters
                </Button>
              }
            >
              Try a different search, source or concept.
            </EmptyState>
          ) : (
            <EmptyState
              icon={Library}
              title="No questions yet"
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={() => setImportOpen(true)}>
                    <FileUp /> Import JSON
                  </Button>
                  <Button onClick={() => setEditor({ mode: 'new' })}>
                    <Plus /> Write a question
                  </Button>
                </div>
              }
            >
              <p>
                Questions you import or write work offline: with no AI available you grade yourself against the rubric you wrote. Everything else is generated by the AI during
                sessions, and those questions show up here too.
              </p>
            </EmptyState>
          )}
        </Card>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span>
              {rows.length} question{rows.length === 1 ? '' : 's'}
            </span>
            {list.isFetching && <Loader2 className="size-3.5 animate-spin text-faint" aria-label="Refreshing" />}
          </div>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <QuestionRow key={r.id} r={r} onOpen={() => setEditor({ mode: 'edit', record: r })} />
              ))}
            </ul>
          </Card>
          {list.isError && <p className="mt-3 text-sm text-danger">Could not refresh: {(list.error as Error).message}</p>}
        </>
      )}

      {dialogs}
    </>
  );
}
