import { useMemo } from 'react';
import { useTheme } from '@/lib/theme';

const VARS = {
  c1: '--chart-1',
  grid: '--chart-grid',
  axis: '--chart-axis',
  surface: '--surface',
  text: '--text',
  muted: '--text-muted',
  faint: '--text-faint',
  warning: '--warning',
  success: '--success',
  danger: '--danger',
} as const;

export type ChartTheme = Record<keyof typeof VARS, string>;

/**
 * SVG presentation attributes don't reliably resolve CSS variables,
 * so read the resolved token values and recompute when the theme flips.
 */
export function useChartTheme(): ChartTheme {
  const { resolved } = useTheme();
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    return Object.fromEntries(Object.entries(VARS).map(([k, v]) => [k, cs.getPropertyValue(v).trim()])) as ChartTheme;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);
}
