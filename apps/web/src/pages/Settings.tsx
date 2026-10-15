import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, PlugZap, RotateCcw, Save, ServerOff, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { MODES, SESSION_MODES, STUDY_TRACKS, TRACK_BY_ID, Settings as SettingsSchema, type Settings } from '@psc/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';

const ROLES: { key: keyof Settings['models']; label: string; hint: string }[] = [
  { key: 'generator', label: 'Question generator', hint: 'Writes new questions from your skill profile.' },
  { key: 'evaluator', label: 'Evaluator', hint: 'Grades answers. Use your most reliable model.' },
  { key: 'simulator', label: 'Simulator', hint: 'Runs pentest simulations. Benefits from a larger model.' },
];

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-6">
      <Label hint={hint}>{label}</Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ModelPicker({ value, onChange, models, id }: { value: string; onChange: (v: string) => void; models: string[]; id: string }) {
  return (
    <>
      <Input list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="model name" className="font-mono text-[13px]" />
      <datalist id={id}>
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: api.settings, retry: false });
  const modelsQ = useQuery({ queryKey: ['ai-models'], queryFn: api.aiModels, retry: false, enabled: settingsQ.isSuccess });
  const [draft, setDraft] = useState<Settings | null>(null);
  const [newFallback, setNewFallback] = useState('');

  useEffect(() => {
    if (settingsQ.data) setDraft(settingsQ.data);
  }, [settingsQ.data]);

  const dirty = useMemo(() => draft && settingsQ.data && JSON.stringify(draft) !== JSON.stringify(settingsQ.data), [draft, settingsQ.data]);

  const save = useMutation({
    mutationFn: (s: Settings) => api.saveSettings(s),
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s);
      qc.invalidateQueries({ queryKey: ['ai-status'] });
      toast.success('Settings saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: (model: string) => api.aiTest(model),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['ai-status'] });
      if (r.ok) toast.success(`Model responded in ${(r.ms / 1000).toFixed(1)}s`);
      else toast.error(r.message);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (settingsQ.isError) {
    return (
      <>
        <PageHeader title="Settings" />
        <Card>
          <EmptyState
            icon={ServerOff}
            title="Settings unavailable"
            action={
              <Button variant="secondary" onClick={() => settingsQ.refetch()}>
                <RotateCcw /> Retry
              </Button>
            }
          >
            {(settingsQ.error as Error).message} The appearance setting below still works.
          </EmptyState>
          <div className="flex items-center justify-between border-t border-border p-5">
            <Label>Theme</Label>
            <ThemeToggle />
          </div>
        </Card>
      </>
    );
  }

  if (!draft) {
    return (
      <>
        <PageHeader title="Settings" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const models = modelsQ.data?.models ?? [];
  const valid = SettingsSchema.safeParse(draft).success;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Models, learning targets and preferences. Stored locally in your database."
        actions={
          <>
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(settingsQ.data!)}>
                Discard
              </Button>
            )}
            <Button disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate(draft)}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save changes
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Profile" description="Used to personalise the mentor's context." />
          <CardBody className="divide-y divide-border">
            <Row label="Name">
              <Input value={draft.learnerName} onChange={(e) => set('learnerName', e.target.value)} />
            </Row>
            <Row label="Learning goal" hint="What you are working toward.">
              <Textarea value={draft.learningGoal} onChange={(e) => set('learningGoal', e.target.value)} rows={3} />
            </Row>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="AI provider"
            description="Any model can fill any role. If a call fails, the fallback chain is tried in order."
            action={
              <Button variant="secondary" size="sm" disabled={test.isPending} onClick={() => test.mutate(draft.models.evaluator)}>
                {test.isPending ? <Loader2 className="animate-spin" /> : <PlugZap />} Test evaluator
              </Button>
            }
          />
          <CardBody className="divide-y divide-border">
            <Row label="Provider">
              <Select value={draft.provider} onChange={(e) => set('provider', e.target.value as Settings['provider'])}>
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI-compatible API</option>
                <option value="mock">Mock (offline testing)</option>
              </Select>
            </Row>
            {draft.provider === 'ollama' && (
              <Row label="Ollama URL">
                <Input value={draft.ollamaUrl} onChange={(e) => set('ollamaUrl', e.target.value)} className="font-mono text-[13px]" />
              </Row>
            )}
            {draft.provider === 'openai' && (
              <>
                <Row label="Base URL">
                  <Input value={draft.openaiUrl} onChange={(e) => set('openaiUrl', e.target.value)} className="font-mono text-[13px]" />
                </Row>
                <Row label="API key" hint="Stored in the local database.">
                  <Input type="password" value={draft.openaiKey} onChange={(e) => set('openaiKey', e.target.value)} autoComplete="off" />
                </Row>
              </>
            )}
            {ROLES.map((r) => (
              <Row key={r.key} label={r.label} hint={r.hint}>
                <ModelPicker id={`models-${r.key}`} models={models} value={draft.models[r.key]} onChange={(v) => set('models', { ...draft.models, [r.key]: v })} />
              </Row>
            ))}
            <Row label="Fallback chain" hint={modelsQ.isError ? 'Could not list models from the provider.' : `${models.length} models available.`}>
              <div className="flex flex-wrap gap-1.5">
                {draft.fallbackModels.map((m, i) => (
                  <span key={m} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 py-0.5 pl-2 pr-1 font-mono text-xs">
                    <span className="text-faint">{i + 1}.</span> {m}
                    <button
                      aria-label={`Remove ${m}`}
                      className="rounded p-0.5 text-faint hover:text-danger"
                      onClick={() => set('fallbackModels', draft.fallbackModels.filter((x) => x !== m))}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = newFallback.trim();
                  if (v && !draft.fallbackModels.includes(v)) set('fallbackModels', [...draft.fallbackModels, v]);
                  setNewFallback('');
                }}
              >
                <ModelPicker id="models-fallback" models={models} value={newFallback} onChange={setNewFallback} />
                <Button type="submit" variant="secondary" disabled={!newFallback.trim()}>
                  Add
                </Button>
              </form>
            </Row>
            <Row label="Temperature" hint="Lower is more consistent grading.">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={draft.temperature}
                  onChange={(e) => set('temperature', Number(e.target.value))}
                  className="flex-1 accent-[var(--accent)]"
                />
                <span className="w-10 text-right font-mono text-sm tabular-nums">{draft.temperature.toFixed(2)}</span>
              </div>
            </Row>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Learning" description="Targets for the discipline system. Competence is the metric, not points." />
          <CardBody className="divide-y divide-border">
            <Row label="Objective" hint="A study track sets your focus domains and a suggested daily goal.">
              <Select
                value={draft.objective || 'all'}
                onChange={(e) => {
                  const t = TRACK_BY_ID[e.target.value];
                  if (t) setDraft((d) => (d ? { ...d, objective: t.id, focusDomains: t.domains, dailyGoal: t.dailyGoal } : d));
                }}
                className="max-w-[18rem]"
              >
                {STUDY_TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Row>
            <Row label="Daily goal" hint="Questions per day.">
              <Input type="number" min={1} max={100} value={draft.dailyGoal} onChange={(e) => set('dailyGoal', Number(e.target.value))} className="w-28" />
            </Row>
            <Row label="Weekly goal" hint="Questions per week.">
              <Input type="number" min={1} max={700} value={draft.weeklyGoal} onChange={(e) => set('weeklyGoal', Number(e.target.value))} className="w-28" />
            </Row>
            <Row label="Preferred session">
              <Select value={draft.preferredMode} onChange={(e) => set('preferredMode', e.target.value as Settings['preferredMode'])}>
                {SESSION_MODES.map((m) => (
                  <option key={m} value={m}>
                    {MODES[m].name}
                  </option>
                ))}
              </Select>
            </Row>
            <Row label="Session reminder" hint="Browser notification at this time each day. Leave empty to disable.">
              <Input type="time" value={draft.sessionReminder} onChange={(e) => set('sessionReminder', e.target.value)} className="w-36" />
            </Row>
            <Row label="Show internal mastery scale" hint="Reveal the raw 0–7 levels alongside percentages.">
              <Switch checked={draft.showInternalScale} onCheckedChange={(v) => set('showInternalScale', v)} />
            </Row>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Appearance" />
          <CardBody>
            <div className="flex items-center justify-between">
              <Label hint="Saved in this browser.">Theme</Label>
              <ThemeToggle />
            </div>
          </CardBody>
        </Card>

        {!valid && (
          <p className="flex items-center gap-2 text-sm text-danger">
            Some values are out of range. Check the goals above.
          </p>
        )}
        {!dirty && settingsQ.isSuccess && (
          <p className="flex items-center gap-2 text-sm text-faint">
            <CheckCircle2 className="size-4" /> All changes saved
          </p>
        )}
      </div>
    </>
  );
}
