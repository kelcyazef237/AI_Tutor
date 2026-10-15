import { AlertTriangle, Gauge, History, Repeat } from 'lucide-react';
import { Link } from 'react-router-dom';
import { confidenceLabel, type CalibrationDTO, type DashboardDTO } from '@psc/shared';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { relative } from '@/lib/format';
import { ChartCard } from './ChartCard';
import { pct } from './Tooltip';

type Level = CalibrationDTO['levels'][number];

export function biasText(bias: number | null) {
  if (bias == null) return 'Rate your confidence on a few more answers to see your calibration.';
  if (bias > 0.08) return `You tend to be overconfident: about ${pct(bias)} below what your confidence predicts.`;
  if (bias < -0.08) return `You tend to be underconfident: about ${pct(-bias)} above what your confidence predicts.`;
  return 'Well calibrated: your confidence matches your results.';
}

/**
 * Stated confidence vs. actual score. One bar per level (single hue) with a tick at the
 * well-calibrated target, so the gap between bar end and tick is the miscalibration.
 */
export function CalibrationChart({ calibration }: { calibration: CalibrationDTO }) {
  const rows = calibration.levels;
  return (
    <ChartCard
      title="Calibration"
      description={biasText(calibration.bias)}
      rows={rows}
      columns={[
        { key: 'l', header: 'You said', cell: (r: Level) => r.label },
        { key: 'n', header: 'Answers', cell: (r: Level) => r.answers, align: 'right' },
        { key: 's', header: 'Actual score', cell: (r: Level) => (r.score == null ? '—' : pct(r.score)), align: 'right' },
        { key: 'e', header: 'Calibrated target', cell: (r: Level) => pct(r.expected), align: 'right' },
      ]}
      footnote={`${calibration.rated} rated answers in the last 90 days. Bar: your actual score. Tick: where a well-calibrated learner would land.`}
    >
      <ul className="space-y-3.5" data-testid="calibration-chart">
        {rows.map((r) => (
          <li
            key={r.level}
            title={r.score == null ? `${r.label}: no answers yet` : `${r.label}: ${pct(r.score)} actual vs ${pct(r.expected)} target · ${r.answers} answers`}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="text-muted">
                {r.label} <span className="text-faint">· {r.answers}</span>
              </span>
              <span className="font-medium tabular-nums text-text">{r.score == null ? '—' : pct(r.score)}</span>
            </div>
            <div className="relative h-2 rounded-[4px] bg-surface-2">
              {r.score != null && <div className="h-2 rounded-[4px] bg-[var(--chart-1)]" style={{ width: `${Math.max(2, r.score * 100)}%` }} />}
              <div className="absolute -top-1 h-4 w-0.5 rounded-full bg-[var(--text)]" style={{ left: `calc(${r.expected * 100}% - 1px)` }} aria-hidden />
            </div>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

/** Delayed recall vs. first attempts, plus the confident errors to fix first. */
export function RetentionCard({ retention, confidentErrors }: { retention: DashboardDTO['retention']; confidentErrors: CalibrationDTO['confidentErrors'] }) {
  const tile = (label: string, sub: string, x: { answers: number; score: number | null }, Icon: typeof Repeat) => (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{x.score == null ? '—' : pct(x.score)}</div>
      <div className="text-xs text-faint">
        {x.answers} answers · {sub}
      </div>
    </div>
  );
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader title="Retention" description="Recall after a delay is the honest measure of learning. Scores right after first exposure flatter you." />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {tile('Delayed recall', '≥ 1 day later', retention.delayed, Repeat)}
          {tile('First attempt', 'new to you', retention.firstTime, History)}
        </div>
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-faint">
            <AlertTriangle className="size-3.5" /> Confident but wrong
          </h4>
          {confidentErrors.length ? (
            <ul className="divide-y divide-border text-sm" data-testid="confident-errors">
              {confidentErrors.map((e) => (
                <li key={e.attemptId} className="flex items-center justify-between gap-3 py-1.5">
                  <Link to={`/skills?c=${e.conceptId}`} className="min-w-0 truncate hover:text-accent">
                    {e.conceptName}
                  </Link>
                  <span className="shrink-0 text-xs text-faint">
                    {confidenceLabel(e.predicted)} · {relative(e.at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Gauge className="size-4" /> No confident mistakes recently.
            </p>
          )}
        </section>
      </CardBody>
    </Card>
  );
}
