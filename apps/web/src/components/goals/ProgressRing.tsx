import type { ReactNode } from 'react';

/** Geometry for an SVG progress ring. `fraction` is clamped to 0..1; `percent` is not capped. */
export function ringGeometry(value: number, goal: number, radius: number) {
  const circumference = 2 * Math.PI * radius;
  const raw = goal > 0 ? Math.max(0, value) / goal : 0;
  const fraction = Math.min(1, raw);
  return {
    circumference,
    fraction,
    dashOffset: circumference * (1 - fraction),
    percent: Math.round(raw * 100),
    met: goal > 0 && value >= goal,
  };
}

export function ProgressRing({ value, goal, label, size = 148, stroke = 12, children }: { value: number; goal: number; label: string; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const g = ringGeometry(value, goal, r);
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={value} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: 'var(--accent-soft)' }} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={g.circumference}
          strokeDashoffset={g.dashOffset}
          style={{ stroke: 'var(--chart-1)', transition: 'stroke-dashoffset 600ms ease' }}
          data-testid="ring-progress"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
