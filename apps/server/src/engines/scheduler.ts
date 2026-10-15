import type { ConceptStateDTO } from '@psc/shared';
import type { MasteryState, Outcome } from './mastery';

/**
 * Spaced review. Interval ladder 4h → 2d → 7d → 21d → 60d, scaled by ease.
 * Success climbs a rung, partial repeats the rung, failure resets to the first rung
 * (and the mastery engine cuts confidence, putting the concept back into active training).
 */
export const LADDER_HOURS = [4, 48, 168, 504, 1440] as const;
export const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const HOUR = 3_600_000;

const scale = (ease: number) => ease / DEFAULT_EASE;

/** Index of the rung the current interval sits on, or -1 if never scheduled. */
export function currentRung(intervalHours: number, ease: number): number {
  if (!intervalHours) return -1;
  let rung = 0;
  for (let i = 0; i < LADDER_HOURS.length; i++) if (LADDER_HOURS[i]! * scale(ease) <= intervalHours * 1.01) rung = i;
  return rung;
}

export function schedule(prev: Pick<MasteryState, 'intervalHours' | 'ease'>, outcome: Outcome, now: number): { intervalHours: number; ease: number; nextReview: number } {
  const rung = currentRung(prev.intervalHours, prev.ease);
  let ease = prev.ease || DEFAULT_EASE;
  let intervalHours: number;
  if (outcome === 'success') {
    ease = Math.min(MAX_EASE, ease + 0.1);
    intervalHours = LADDER_HOURS[Math.min(LADDER_HOURS.length - 1, rung + 1)]! * scale(ease);
  } else if (outcome === 'partial') {
    ease = Math.max(MIN_EASE, ease - 0.05);
    intervalHours = LADDER_HOURS[Math.max(0, rung)]! * scale(ease);
  } else {
    ease = Math.max(MIN_EASE, ease - 0.2);
    intervalHours = LADDER_HOURS[0];
  }
  // Never schedule a review sooner than the first rung.
  intervalHours = Math.max(LADDER_HOURS[0], intervalHours);
  return { intervalHours, ease, nextReview: now + intervalHours * HOUR };
}

/** Display status, shared by /concepts, the dashboard and the selector. */
export function conceptStatus(s: Pick<MasteryState, 'attempts' | 'mastery' | 'confidence' | 'nextReview' | 'intervalHours'>, now: number): ConceptStateDTO['status'] {
  if (!s.attempts) return 'unknown';
  if (s.nextReview != null && s.nextReview <= now) {
    const overdueH = (now - s.nextReview) / HOUR;
    return overdueH > Math.max(4, s.intervalHours * 0.5) && s.mastery >= 2 ? 'at-risk' : 'review-due';
  }
  return s.mastery >= 4.5 && s.confidence >= 0.5 ? 'solid' : 'learning';
}
