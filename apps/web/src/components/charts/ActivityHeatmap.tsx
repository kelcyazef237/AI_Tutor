import { useMemo, useRef, useState } from 'react';
import type { DashboardDTO } from '@psc/shared';
import { ChartCard } from './ChartCard';
import { TooltipBox } from './Tooltip';

type Day = DashboardDTO['activity'][number];

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 26;
const TOP = 16;
const BINS = [0, 1, 3, 6, 10, 15]; // lower bounds for heat-0..heat-5

const level = (n: number) => BINS.reduce((lvl, lo, i) => (n >= lo ? i : lvl), 0);

function longDate(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function ActivityHeatmap({ activity, dailyGoal, className }: { activity: Day[]; dailyGoal: number; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ d: Day; x: number; y: number } | null>(null);

  const { cells, weeks, months, activeDays, totalQ } = useMemo(() => {
    const pad = activity.length ? new Date(`${activity[0]!.day}T00:00:00`).getDay() : 0; // align columns to Sun..Sat
    const cells = activity.map((d, i) => ({ d, col: Math.floor((i + pad) / 7), row: (i + pad) % 7 }));
    const weeks = cells.length ? cells.at(-1)!.col + 1 : 0;
    const months: { col: number; label: string }[] = [];
    let last = -1;
    for (const c of cells) {
      const m = new Date(`${c.d.day}T00:00:00`).getMonth();
      if (m !== last && c.row === 0) {
        months.push({ col: c.col, label: new Date(`${c.d.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short' }) });
        last = m;
      }
    }
    return {
      cells,
      weeks,
      months,
      activeDays: activity.filter((d) => d.questions > 0).length,
      totalQ: activity.reduce((s, d) => s + d.questions, 0),
    };
  }, [activity]);

  const width = LEFT + weeks * STEP;
  const height = TOP + 7 * STEP;

  return (
    <ChartCard
      className={className}
      title="Activity"
      description={
        <>
          <span className="font-semibold text-text">{totalQ}</span> questions on <span className="font-semibold text-text">{activeDays}</span> days · last 26 weeks
        </>
      }
      rows={[...activity].reverse().filter((d) => d.questions > 0)}
      columns={[
        { key: 'd', header: 'Day', cell: (r) => longDate(r.day) },
        { key: 'q', header: 'Questions', cell: (r) => r.questions, align: 'right' },
        { key: 'c', header: 'Correct', cell: (r) => r.correct, align: 'right' },
        { key: 'g', header: 'Goal met', cell: (r) => (r.questions >= dailyGoal ? 'Yes' : 'No'), align: 'right' },
      ]}
    >
      <div ref={wrap} className="relative" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" style={{ maxWidth: width * 1.3 }} role="img" aria-label={`Activity heatmap: ${totalQ} questions over ${activeDays} active days`}>
          {months.map((m) => (
            <text key={`${m.col}-${m.label}`} x={LEFT + m.col * STEP} y={10} fontSize={9} fill="var(--text-faint)" style={{ fill: 'var(--text-faint)' }}>
              {m.label}
            </text>
          ))}
          {['Mon', 'Wed', 'Fri'].map((d, i) => (
            <text key={d} x={0} y={TOP + (1 + i * 2) * STEP + CELL - 2} fontSize={9} style={{ fill: 'var(--text-faint)' }}>
              {d}
            </text>
          ))}
          {cells.map(({ d, col, row }) => (
            <rect
              key={d.day}
              x={LEFT + col * STEP}
              y={TOP + row * STEP}
              width={CELL}
              height={CELL}
              rx={2}
              style={{ fill: `var(--heat-${level(d.questions)})` }}
              stroke={hover?.d.day === d.day ? 'var(--text)' : 'none'}
              strokeWidth={1.2}
              onPointerEnter={(e) => {
                const box = wrap.current!.getBoundingClientRect();
                const r = (e.target as SVGRectElement).getBoundingClientRect();
                setHover({ d, x: r.left - box.left + r.width / 2, y: r.top - box.top });
              }}
            />
          ))}
        </svg>
        {hover && (
          <div className="absolute z-10 -translate-x-1/2 -translate-y-full" style={{ left: hover.x, top: hover.y - 6 }}>
            <TooltipBox
              title={longDate(hover.d.day)}
              rows={[
                { key: 'q', value: hover.d.questions, label: hover.d.questions === 1 ? 'question' : 'questions', swatch: 'none' },
                ...(hover.d.questions ? [{ key: 'c', value: hover.d.correct, label: 'correct', swatch: 'none' as const }] : []),
              ]}
            />
          </div>
        )}
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-faint">
          Less
          {BINS.map((_, i) => (
            <span key={i} className="size-[11px] rounded-[2px]" style={{ background: `var(--heat-${i})` }} />
          ))}
          More
        </div>
      </div>
    </ChartCard>
  );
}
