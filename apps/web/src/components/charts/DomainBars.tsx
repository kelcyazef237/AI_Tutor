import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardDTO } from '@psc/shared';
import { ChartCard } from './ChartCard';
import { pct, TooltipBox } from './Tooltip';
import { useChartTheme } from './useChartTheme';

type Row = DashboardDTO['areas'][number];

export function DomainBars({ areas }: { areas: Row[] }) {
  const t = useChartTheme();
  const height = areas.length * 40 + 28;
  return (
    <ChartCard
      title="Skill by area"
      description="Average mastery of assessed concepts."
      footnote="Fainter bars rest on less evidence. Not a measure of professional ability."
      rows={areas}
      columns={[
        { key: 'a', header: 'Area', cell: (r) => r.name },
        { key: 'm', header: 'Mastery', cell: (r) => pct(r.mastery), align: 'right' },
        { key: 'c', header: 'Confidence', cell: (r) => pct(r.confidence), align: 'right' },
        { key: 'n', header: 'Assessed', cell: (r) => `${r.assessed} / ${r.total}`, align: 'right' },
      ]}
    >
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={areas} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={12}>
            <CartesianGrid horizontal={false} stroke={t.grid} />
            <XAxis
              type="number"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={pct}
              tick={{ fill: t.faint, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis type="category" dataKey="name" width={120} tick={{ fill: t.muted, fontSize: 12 }} axisLine={{ stroke: t.grid }} tickLine={false} />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.5 }}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as Row | undefined;
                if (!active || !r) return null;
                return (
                  <TooltipBox
                    title={r.name}
                    rows={[
                      { key: 'm', value: pct(r.mastery), label: 'mastery' },
                      { key: 'c', value: pct(r.confidence), label: 'confidence', swatch: 'none' },
                      { key: 'n', value: `${r.assessed}/${r.total}`, label: 'concepts assessed', swatch: 'none' },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="mastery" barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {areas.map((a) => (
                <Cell key={a.id} fill={t.c1} fillOpacity={0.35 + 0.65 * a.confidence} />
              ))}
              <LabelList dataKey="mastery" position="right" formatter={(v: unknown) => pct(Number(v))} fill={t.muted} fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
