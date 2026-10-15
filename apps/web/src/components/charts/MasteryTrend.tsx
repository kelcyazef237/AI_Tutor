import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardDTO } from '@psc/shared';
import { ChartCard } from './ChartCard';
import { pct, shortDay, TooltipBox } from './Tooltip';
import { useChartTheme } from './useChartTheme';

type Row = DashboardDTO['trend'][number];

export function MasteryTrend({ trend }: { trend: Row[] }) {
  const t = useChartTheme();
  const first = trend[0]?.overall ?? 0;
  const last = trend.at(-1)?.overall ?? 0;
  const delta = Math.round((last - first) * 100);
  return (
    <ChartCard
      title="Mastery over time"
      description={
        trend.length ? (
          <>
            Now <span className="font-semibold text-text">{pct(last)}</span>
            {' · '}
            <span className={delta >= 0 ? 'text-success' : 'text-danger'}>
              {delta >= 0 ? '+' : '−'}
              {Math.abs(delta)} pts
            </span>{' '}
            over {trend.length} days
          </>
        ) : (
          'No history yet.'
        )
      }
      rows={[...trend].reverse()}
      columns={[
        { key: 'd', header: 'Day', cell: (r) => shortDay(r.day) },
        { key: 'o', header: 'Overall mastery', cell: (r) => pct(r.overall), align: 'right' },
      ]}
    >
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={40} tick={{ fill: t.faint, fontSize: 11 }} axisLine={{ stroke: t.grid }} tickLine={false} />
            <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={pct} width={40} tick={{ fill: t.faint, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ stroke: t.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as Row | undefined;
                if (!active || !r) return null;
                return <TooltipBox title={shortDay(r.day)} rows={[{ key: 'o', value: pct(r.overall), label: 'overall mastery' }]} />;
              }}
            />
            <Area
              type="monotone"
              dataKey="overall"
              stroke={t.c1}
              strokeWidth={2}
              fill={t.c1}
              fillOpacity={0.1}
              activeDot={{ r: 4, fill: t.c1, stroke: t.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
