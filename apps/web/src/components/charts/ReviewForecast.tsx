import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardDTO } from '@psc/shared';
import { ChartCard } from './ChartCard';
import { TooltipBox, shortDay, weekday } from './Tooltip';
import { useChartTheme } from './useChartTheme';

interface Row {
  key: string;
  label: string;
  title: string;
  count: number;
  overdue: boolean;
}

export function ReviewForecast({ forecast, overdue }: { forecast: DashboardDTO['forecast']; overdue: number }) {
  const t = useChartTheme();
  const rows: Row[] = [
    { key: 'overdue', label: 'Late', title: 'Overdue now', count: overdue, overdue: true },
    ...forecast.map((f, i) => ({
      key: f.day,
      label: String(new Date(`${f.day}T00:00:00`).getDate()),
      title: i === 0 ? 'Today' : `${weekday(f.day)} ${shortDay(f.day)}`,
      count: f.count,
      overdue: false,
    })),
  ];
  const peak = Math.max(...forecast.map((f) => f.count));
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <ChartCard
      title="Review forecast"
      description={
        <>
          <span className="font-semibold text-text">{total}</span> reviews due now or in the next 14 days (by day of month)
        </>
      }
      rows={rows}
      columns={[
        { key: 'd', header: 'When', cell: (r) => r.title },
        { key: 'c', header: 'Reviews', cell: (r) => r.count, align: 'right' },
      ]}
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 18, right: 0, bottom: 0, left: 0 }} barCategoryGap={4}>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis dataKey="label" interval={0} tick={{ fill: t.faint, fontSize: 10 }} height={24} axisLine={{ stroke: t.grid }} tickLine={false} />
            <YAxis allowDecimals={false} width={28} tick={{ fill: t.faint, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.5 }}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as Row | undefined;
                if (!active || !r) return null;
                return <TooltipBox title={r.title} rows={[{ key: 'c', value: r.count, label: r.count === 1 ? 'review' : 'reviews' }]} />;
              }}
            />
            <Bar dataKey="count" maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.key} fill={r.overdue ? t.warning : t.c1} />
              ))}
              {/* Label selectively: overdue and the peak day only */}
              <LabelList
                dataKey="count"
                content={(p) => {
                  const { x, y, width, value, index } = p as { x: number; y: number; width: number; value: number; index: number };
                  const r = rows[index];
                  if (!r || !value || !(r.overdue || value === peak)) return null;
                  return (
                    <text x={x + width / 2} y={y - 6} textAnchor="middle" fill={t.muted} fontSize={11}>
                      {value}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
