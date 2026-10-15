import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Circle,
  CircleDot,
  Cloud,
  Code2,
  Container,
  Database,
  Eye,
  FileCode,
  FileSearch,
  Globe,
  Hourglass,
  KeyRound,
  LayoutGrid,
  Lock,
  Monitor,
  Network,
  Route,
  Search,
  ShieldCheck,
  Table2,
  Terminal,
  Webhook,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AREAS, CONCEPT_BY_ID, CONCEPTS, DOMAINS, difficultyName, type ConceptStateDTO } from '@psc/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { LoadError } from '@/components/ui/load-error';
import { cn } from '@/lib/utils';

type Status = ConceptStateDTO['status'];

const DOMAIN_ICON: Record<string, LucideIcon> = {
  Network, Globe, FileCode, Lock, Terminal, Monitor, Building2, KeyRound, ShieldCheck, Database, Webhook, Cloud, Container, Route, Wrench, Code2, FileSearch, Bot,
};

const STATUS: Record<Status, { label: string; icon: LucideIcon; tone: 'neutral' | 'accent' | 'warning' | 'danger' }> = {
  unknown: { label: 'Not assessed', icon: Circle, tone: 'neutral' },
  learning: { label: 'Learning', icon: CircleDot, tone: 'neutral' },
  'review-due': { label: 'Review due', icon: Hourglass, tone: 'warning' },
  'at-risk': { label: 'At risk', icon: AlertTriangle, tone: 'danger' },
  solid: { label: 'Solid', icon: CheckCircle2, tone: 'accent' },
};

const LEGEND = ['Not assessed', '0–20%', '20–40%', '40–60%', '60–80%', '80–100%'];

/** Heat step 0..5: 0 = not assessed, 1..5 = fifths of the 0–7 mastery range. */
const heat = (c: ConceptStateDTO) => (c.attempts === 0 ? 0 : 1 + Math.min(4, Math.floor((c.mastery / 7) * 5)));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const mpct = (m: number) => pct(m / 7);

function fmtDate(ts: number | null) {
  if (!ts) return '—';
  const days = Math.round((ts - Date.now()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

/* ── Tile ───────────────────────────────────────────────────── */

function Tile({ c, onOpen }: { c: ConceptStateDTO; onOpen: () => void }) {
  const h = heat(c);
  const S = STATUS[c.status];
  const flag = c.status === 'review-due' || c.status === 'at-risk';
  return (
    <button
      onClick={onOpen}
      title={`${c.name} · ${c.attempts ? `${mpct(c.mastery)} mastery` : 'not assessed'} · ${S.label}`}
      className="group relative flex min-h-[72px] flex-col justify-between rounded-lg p-2.5 text-left transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:-translate-y-0.5"
      style={{ background: `var(--heat-${h})`, color: `var(--heat-fg-${h})` }}
    >
      <span className="line-clamp-2 text-xs font-medium leading-snug [overflow-wrap:anywhere]">{c.name}</span>
      <span className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold tabular-nums">
        {c.attempts ? mpct(c.mastery) : '—'}
        {flag && (
          <span className="grid size-4 place-items-center rounded-full bg-surface text-warning" aria-label={S.label}>
            <S.icon className="size-2.5" strokeWidth={2.5} />
          </span>
        )}
      </span>
    </button>
  );
}

/* ── Detail sheet ───────────────────────────────────────────── */

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums">{pct(value)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-accent-soft">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1, value * 100)}%` }} />
      </div>
    </div>
  );
}

function ConceptChip({ id, byId, onOpen }: { id: string; byId: Map<string, ConceptStateDTO>; onOpen: (id: string) => void }) {
  const c = byId.get(id);
  const h = c ? heat(c) : 0;
  return (
    <button onClick={() => onOpen(id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
      <span className="size-3 shrink-0 rounded-[3px]" style={{ background: `var(--heat-${h})`, boxShadow: h === 0 ? 'inset 0 0 0 1px var(--border-strong)' : undefined }} />
      <span className="min-w-0 flex-1 truncate">{CONCEPT_BY_ID[id]?.name ?? id}</span>
      <span className="shrink-0 text-xs text-faint tabular-nums">{c?.attempts ? mpct(c.mastery) : '—'}</span>
    </button>
  );
}

function DetailSheet({ c, byId, showScale, onOpen, onClose }: { c: ConceptStateDTO | null; byId: Map<string, ConceptStateDTO>; showScale: boolean; onOpen: (id: string) => void; onClose: () => void }) {
  const def = c ? CONCEPT_BY_ID[c.conceptId] : undefined;
  const dependents = useMemo(() => (c ? CONCEPTS.filter((x) => x.prereqs?.includes(c.conceptId)).map((x) => x.id) : []), [c]);
  const S = c ? STATUS[c.status] : null;

  return (
    <Dialog.Root open={!!c} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl outline-none">
          {c && S && (
            <>
              <div className="flex items-start gap-3 border-b border-border p-5">
                <div className="min-w-0 flex-1">
                  <Dialog.Description className="text-xs text-faint">{c.domainName}</Dialog.Description>
                  <Dialog.Title className="mt-0.5 text-lg font-semibold leading-snug">{c.name}</Dialog.Title>
                  <Badge tone={S.tone} className="mt-2">
                    <S.icon className="size-3" /> {S.label}
                  </Badge>
                </div>
                <Dialog.Close asChild>
                  <Button variant="ghost" size="icon" aria-label="Close">
                    <X />
                  </Button>
                </Dialog.Close>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto p-5">
                {c.attempts === 0 ? (
                  <p className="rounded-lg bg-surface-2 p-4 text-sm text-muted">Not assessed yet. It will be introduced once its prerequisites are in place, or when you focus on its domain.</p>
                ) : (
                  <>
                    <div className="flex items-end gap-6">
                      <div>
                        <div className="text-4xl font-semibold tracking-tight">{mpct(c.mastery)}</div>
                        <div className="mt-1 text-xs text-muted">mastery{showScale && ` · level ${c.mastery.toFixed(1)} / 7`}</div>
                      </div>
                      <div className="flex-1 pb-1">
                        <Meter value={c.confidence} label="Confidence in estimate" />
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        ['Attempts', c.attempts],
                        ['Hardest passed', c.maxDifficultyPassed ? difficultyName(c.maxDifficultyPassed).toLowerCase() : '—'],
                        ['Success streak', c.successStreak],
                        ['Failure streak', c.failStreak],
                        ['Last assessed', fmtDate(c.lastAssessed)],
                        ['Next review', fmtDate(c.nextReview)],
                      ].map(([k, v]) => (
                        <div key={k as string} className="rounded-lg bg-surface-2 px-3 py-2">
                          <dt className="text-xs text-faint">{k}</dt>
                          <dd className="mt-0.5 font-medium">{v}</dd>
                        </div>
                      ))}
                    </dl>

                    <section>
                      <h4 className="mb-3 text-sm font-semibold">Dimensions</h4>
                      <div className="space-y-3">
                        <Meter value={c.dims.theory} label="Theoretical knowledge" />
                        <Meter value={c.dims.practical} label="Practical application" />
                        <Meter value={c.dims.pentest} label="Pentest relevance" />
                        <Meter value={c.dims.obsHyp} label="Observation vs hypothesis" />
                        <Meter value={c.dims.attackPath} label="Attack-path reasoning" />
                      </div>
                    </section>
                  </>
                )}

                <section>
                  <h4 className="mb-1.5 text-sm font-semibold">Prerequisites</h4>
                  {def?.prereqs?.length ? def.prereqs.map((id) => <ConceptChip key={id} id={id} byId={byId} onOpen={onOpen} />) : <p className="text-sm text-faint">None. This is a foundation concept.</p>}
                </section>
                <section>
                  <h4 className="mb-1.5 text-sm font-semibold">Unlocks</h4>
                  {dependents.length ? dependents.map((id) => <ConceptChip key={id} id={id} byId={byId} onOpen={onOpen} />) : <p className="text-sm text-faint">Nothing depends on this directly.</p>}
                </section>
              </div>

              <div className="border-t border-border p-4">
                <Link to="/train" onClick={onClose}>
                  <Button className="w-full">
                    Go to Train <ArrowRight />
                  </Button>
                </Link>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ── Page ───────────────────────────────────────────────────── */

export function SkillMapPage() {
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: api.settings, retry: false });
  const q = useQuery({ queryKey: ['concepts'], queryFn: api.concepts, retry: false });
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [area, setArea] = useState('all');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [view, setView] = useState<'map' | 'table'>('map');

  const data = q.data;

  const skillError = q.isError;
  const byId = useMemo(() => new Map((data ?? []).map((c) => [c.conceptId, c])), [data]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data ?? []).filter(
      (c) => (area === 'all' || c.area === area) && (status === 'all' || c.status === status) && (!s || c.name.toLowerCase().includes(s) || c.domainName.toLowerCase().includes(s)),
    );
  }, [data, search, area, status]);

  const openId = params.get('c');
  const open = openId ? (byId.get(openId) ?? null) : null;
  const openConcept = (id: string) => setParams((p) => (p.set('c', id), p), { replace: !!openId });
  const close = () => setParams((p) => (p.delete('c'), p));

  if (skillError) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;

  if (!data) {
    return (
      <>
        <PageHeader title="Skill Map" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>
      </>
    );
  }

  const assessed = data.filter((c) => c.attempts > 0);
  const counts = Object.fromEntries((Object.keys(STATUS) as Status[]).map((k) => [k, data.filter((c) => c.status === k).length])) as Record<Status, number>;
  const domains = DOMAINS.map((d) => ({ d, items: filtered.filter((c) => c.domainId === d.id) })).filter((x) => x.items.length);

  return (
    <>
      <PageHeader
        title="Skill Map"
        description={
          <>
            {assessed.length} of {data.length} concepts assessed · {counts.solid} solid · {counts['review-due'] + counts['at-risk']} need review
          </>
        }
      />

      {/* Filters: one row, scoping everything below */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search concepts" className="pl-9" aria-label="Search concepts" />
        </div>
        <Select value={area} onChange={(e) => setArea(e.target.value)} className="w-auto" aria-label="Area">
          <option value="all">All areas</option>
          {AREAS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as 'all' | Status)} className="w-auto" aria-label="Status">
          <option value="all">Any status</option>
          {(Object.keys(STATUS) as Status[]).map((k) => (
            <option key={k} value={k}>
              {STATUS[k].label} ({counts[k]})
            </option>
          ))}
        </Select>
        <div role="tablist" aria-label="View" className="ml-auto flex rounded-lg border border-border bg-surface-2 p-0.5">
          {([['map', LayoutGrid, 'Map'], ['table', Table2, 'Table']] as const).map(([v, I, label]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted hover:text-text', view === v && 'bg-surface text-text shadow-card')}>
              <I className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        {LEGEND.map((l, i) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px]" style={{ background: `var(--heat-${i})`, boxShadow: i === 0 ? 'inset 0 0 0 1px var(--border-strong)' : undefined }} />
            {l}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="grid size-4 place-items-center rounded-full border border-border bg-surface text-warning">
            <Hourglass className="size-2.5" strokeWidth={2.5} />
          </span>
          Review due / at risk
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="No concepts match" action={<Button variant="secondary" onClick={() => (setSearch(''), setArea('all'), setStatus('all'))}>Clear filters</Button>}>
            Try a different search or filter.
          </EmptyState>
        </Card>
      ) : view === 'map' ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {domains.map(({ d, items }) => {
            const Icon = DOMAIN_ICON[d.icon] ?? Network;
            const done = items.filter((c) => c.attempts > 0);
            const avg = done.length ? done.reduce((s, c) => s + c.mastery, 0) / done.length : 0;
            return (
              <Card key={d.id} className="min-w-0 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-lg bg-surface-2 text-muted">
                    <Icon className="size-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{d.name}</h3>
                    <p className="text-xs text-faint">
                      {done.length}/{items.length} assessed
                    </p>
                  </div>
                  {done.length > 0 && (
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">{mpct(avg)}</div>
                      <div className="text-[11px] text-faint">avg mastery</div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-1.5">
                  {items.map((c) => (
                    <Tile key={c.conceptId} c={c} onOpen={() => openConcept(c.conceptId)} />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  {['Concept', 'Domain', 'Mastery', 'Confidence', 'Attempts', 'Status', 'Next review'].map((h, i) => (
                    <th key={h} className={cn('whitespace-nowrap px-4 py-2.5 font-medium', i >= 2 && i <= 4 ? 'text-right' : 'text-left')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => {
                  const S = STATUS[c.status];
                  return (
                    <tr key={c.conceptId} onClick={() => openConcept(c.conceptId)} className="cursor-pointer hover:bg-surface-2">
                      <td className="px-4 py-2 font-medium">
                        <button className="text-left hover:text-accent" onClick={(e) => (e.stopPropagation(), openConcept(c.conceptId))}>
                          {c.name}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted">{c.domainName}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.attempts ? mpct(c.mastery) : '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.attempts ? pct(c.confidence) : '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.attempts}</td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <Badge tone={S.tone}>
                          <S.icon className="size-3" /> {S.label}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted">{fmtDate(c.nextReview)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DetailSheet c={open} byId={byId} showScale={!!settingsQ.data?.showInternalScale} onOpen={openConcept} onClose={close} />
    </>
  );
}
