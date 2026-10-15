import { CheckCircle2, CircleDot, XCircle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Result } from '@psc/shared';
import { ChartCard } from './ChartCard';
import { useChartTheme } from './useChartTheme';

export interface ResultBucket {
  key: string;
  label: string;
  title: string;
  correct: number;
  partial: number;
  incorrect: number;
}

const SERIES: { key: Result; label: string; icon: typeof CheckCircle2; color: 'success' | 'warning' | 'danger' }[] = [
  { key: 'correct', label: 'Correct', icon: CheckCircle2, color: 'success' },
  { key: 'partial', label: 'Partial', icon: CircleDot, color: 'warning' },
  { key: 'incorrect', label: 'Incorrect', icon: XCircle, color: 'danger' },
];

export function ResultsChart({ buckets, unit }: { buckets: ResultBucket[]; unit: 'day' | 'week' }) {
  const t = useChartTheme();
  const total = buckets.reduce((s, b) => s + b.correct + b.partial + b.incorrect, 0);
  return (
    <ChartCard
      title="Answers over time"
      description={`${total} graded answers, per ${unit}`}
      rows={[...buckets].reverse().filter((b) => b.correct + b.partial + b.incorrect > 0)}
      columns={[
        { key: 'w', header: unit === 'day' ? 'Day' : 'Week of', cell: (b) => b.title },
        { key: 'c', header: 'Correct', cell: (b) => b.correct, align: 'right' },
        { key: 'p', header: 'Partial', cell: (b) => b.partial, align: 'right' },
        { key: 'i', header: 'Incorrect', cell: (b) => b.incorrect, align: 'right' },
      ]}
    >
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: t[s.color] }} />
            <s.icon className="size-3.5" /> {s.label}
          </span>
        ))}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={unit === 'day' ? 2 : 6}>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} tick={{ fill: t.faint, fontSize: 11 }} axisLine={{ stroke: t.grid }} tickLine={false} />
            <YAxis allowDecimals={false} width={28} tick={{ fill: t.faint, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.5 }}
              content={({ active, payload }) => {
                const b = payload?.[0]?.payload as ResultBucket | undefined;
                if (!active || !b) return null;
                const n = b.correct + b.partial + b.incorrect;
                return (
                  <div className="pointer-events-none min-w-40 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
                    <div className="mb-1 text-faint">{b.title}</div>
                    {SERIES.map((s) => (
                      <div key={s.key} className="flex items-center gap-2">
                        <span className="h-0.5 w-3 rounded-full" style={{ background: t[s.color] }} />
                        <span className="font-semibold tabular-nums text-text">{b[s.key]}</span>
                        <span className="text-muted">{s.label.toLowerCase()}</span>
                      </div>
                    ))}
                    {n > 0 && <div className="mt-1 border-t border-border pt-1 text-muted">{Math.round((b.correct / n) * 100)}% correct</div>}
                  </div>
                );
              }}
            />
            {SERIES.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="r"
                fill={t[s.color]}
                stroke={t.surface}
                strokeWidth={1}
                maxBarSize={24}
                radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
