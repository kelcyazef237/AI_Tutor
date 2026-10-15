import { AlertTriangle, ArrowRight, Check, Flag, LayoutDashboard, Loader2, NotebookPen } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MODES, REFLECTION_PROMPTS, type SessionEndDTO, type SessionMode, type SessionReflection } from '@psc/shared';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { api } from '@/lib/api';
import { fmtMinutes } from '@/lib/format';
import { MODE_ICON } from '@/lib/modeIcons';
import { Collapsible, EvaluationPanel, MasteryChange, RESULT, ResultBadge, type Result } from './Feedback';

/** A few minutes of reflection: retrieval plus elaboration (Make It Stick, ch. 8). */
export function ReflectionCard({ sessionId, initial }: { sessionId: string; initial: SessionReflection | null }) {
  const [r, setR] = useState<SessionReflection>(initial ?? { wentWell: '', change: '', connects: '' });
  const [saved, setSaved] = useState<SessionReflection | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(r) !== JSON.stringify(saved ?? { wentWell: '', change: '', connects: '' });
  const empty = !r.wentWell.trim() && !r.change.trim() && !r.connects.trim();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await api.saveReflection(sessionId, r);
      setSaved(s.reflection);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="reflection">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <NotebookPen className="size-4 text-accent" /> Reflect for two minutes
          </span>
        }
        description="Without looking back at the answers. Writing it down is retrieval practice, and linking it to what you know makes it stick."
      />
      <CardBody className="space-y-4">
        {REFLECTION_PROMPTS.map((p) => (
          <label key={p.key} className="block">
            <span className="text-sm font-medium">{p.label}</span>
            <span className="mt-0.5 block text-xs text-muted">{p.hint}</span>
            <textarea
              value={r[p.key]}
              maxLength={4000}
              rows={2}
              onChange={(e) => setR((x) => ({ ...x, [p.key]: e.target.value }))}
              className="mt-1.5 block w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>
        ))}
        <div className="flex items-center justify-end gap-3">
          {error && <span className="text-sm text-danger">{error}</span>}
          {!dirty && saved && (
            <span className="inline-flex items-center gap-1 text-sm text-muted">
              <Check className="size-4 text-accent" /> Saved
            </span>
          )}
          <Button variant="secondary" disabled={busy || !dirty || (empty && !saved)} onClick={() => void save()}>
            {busy && <Loader2 className="animate-spin" />} Save reflection
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function SessionSummary({ data, mode }: { data: SessionEndDTO; mode: SessionMode }) {
  const s = data.summary;
  const graded = s.results.correct + s.results.partial + s.results.incorrect;
  const Icon = MODE_ICON[mode];
  const duration = s.endedAt ? s.endedAt - s.startedAt : null;
  const isExam = mode === 'exam' || MODES[mode].feedback === 'end';

  return (
    <div className="space-y-6" data-testid="session-summary">
      <Card className="overflow-hidden border-accent/30 bg-gradient-to-br from-accent-soft/70 to-surface">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg">
            <Flag className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-accent">
              <Icon className="size-3.5" /> {MODES[mode].name}
            </div>
            <h2 className="mt-0.5 text-xl font-semibold">Session complete</h2>
            <p className="text-sm text-muted">
              {s.answered} of {s.total} answered{duration != null && ` · ${fmtMinutes(duration)}`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to="/">
              <Button variant="secondary" className="w-full">
                <LayoutDashboard /> Back to dashboard
              </Button>
            </Link>
            <Link to={`/train?mode=${mode}`}>
              <Button className="w-full">
                Train again <ArrowRight />
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader title="Results" description={`${graded} graded answer${graded === 1 ? '' : 's'}`} />
          <CardBody>
            {graded > 0 && (
              <div className="mb-4 flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-surface-2" aria-hidden>
                {(['correct', 'partial', 'incorrect'] as Result[]).map((k) =>
                  s.results[k] ? <div key={k} className={k === 'correct' ? 'bg-success' : k === 'partial' ? 'bg-warning' : 'bg-danger'} style={{ width: `${(s.results[k] / graded) * 100}%` }} /> : null,
                )}
              </div>
            )}
            <ul className="grid grid-cols-3 gap-3">
              {(['correct', 'partial', 'incorrect'] as Result[]).map((k) => {
                const R = RESULT[k];
                return (
                  <li key={k} className="rounded-lg border border-border p-3">
                    <div className={`flex items-center gap-1.5 text-xs ${R.text}`}>
                      <R.icon className="size-3.5" /> {R.label}
                    </div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums" data-testid={`count-${k}`}>
                      {s.results[k]}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Mastery changes" description="Concepts whose mastery moved this session." />
          <CardBody>
            {data.masteryChanges.length ? (
              <ul className="divide-y divide-border">
                {data.masteryChanges.map((m) => (
                  <li key={m.conceptId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{m.conceptName}</span>
                    <MasteryChange before={m.before} after={m.after} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-faint">No mastery changes recorded.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {data.newMisconceptions.length > 0 && (
        <Card>
          <CardHeader title="New misconceptions" description="These will be revisited in future sessions." />
          <CardBody>
            <ul className="space-y-2">
              {data.newMisconceptions.map((m, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Misconception" />
                  <div className="min-w-0">
                    <p>{m.text}</p>
                    <p className="text-xs text-faint">{m.conceptName}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {s.answered > 0 && <ReflectionCard sessionId={s.id} initial={s.reflection} />}

      {isExam && data.evaluations.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted">Answers and feedback</h3>
          {data.evaluations.map((e, i) => (
            <Collapsible
              key={e.attemptId}
              summary={
                <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {i + 1}. {e.conceptName}
                  </span>
                  <ResultBadge result={e.result} className="py-0.5 text-xs" />
                </span>
              }
            >
              <div className="space-y-4">
                <Markdown className="text-muted">{e.prompt}</Markdown>
                <EvaluationPanel evaluation={e} />
              </div>
            </Collapsible>
          ))}
        </section>
      )}
    </div>
  );
}
