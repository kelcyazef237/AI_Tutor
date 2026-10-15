import type { ReactNode } from 'react';

/** Shared tooltip surface: value leads (strong), label follows (muted). */
export function TooltipBox({ title, rows }: { title: ReactNode; rows: { key: string; value: ReactNode; label: ReactNode; swatch?: 'line' | 'none' }[] }) {
  return (
    <div className="pointer-events-none min-w-36 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-faint">{title}</div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2">
          {r.swatch !== 'none' && <span className="h-0.5 w-3 rounded-full bg-[var(--chart-1)]" />}
          <span className="font-semibold text-text tabular-nums">{r.value}</span>
          <span className="text-muted">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export function shortDay(day: string) {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function weekday(day: string) {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}
