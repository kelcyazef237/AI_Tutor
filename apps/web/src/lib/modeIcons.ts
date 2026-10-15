import { ClipboardCheck, Crosshair, Layers, Mountain, RotateCcw, Route, Swords, Zap, type LucideIcon } from 'lucide-react';
import type { SessionMode } from '@psc/shared';

export const MODE_ICON: Record<SessionMode | 'simulation', LucideIcon> = {
  quick: Zap,
  standard: Layers,
  deep: Mountain,
  exam: ClipboardCheck,
  weakness: Crosshair,
  review: RotateCcw,
  challenge: Swords,
  simulation: Route,
};
