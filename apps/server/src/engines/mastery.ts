import { QUESTION_TYPE_EVIDENCE, type Dims, type Evaluation, type QuestionType } from '@psc/shared';
import type { Result } from '@psc/shared';

/**
 * Mastery engine. The AI only *proposes* a delta; this module decides.
 * One answer can move mastery by at most MAX_STEP on the 0..7 scale, so a
 * single answer never proves (or destroys) mastery.
 */
export const MAX_STEP = 0.35;
export const MAX_MASTERY = 7;
/** Confidence never reaches certainty. */
export const MAX_CONFIDENCE = 0.95;

export interface MasteryState {
  mastery: number; // 0..7
  confidence: number; // 0..1
  attempts: number;
  successStreak: number;
  failStreak: number;
  maxDiffPassed: number;
  typesSeen: string[];
  lastAssessed: number | null;
  nextReview: number | null;
  intervalHours: number;
  ease: number;
  dims: Dims;
}

export const emptyState = (): MasteryState => ({
  mastery: 0,
  confidence: 0,
  attempts: 0,
  successStreak: 0,
  failStreak: 0,
  maxDiffPassed: 0,
  typesSeen: [],
  lastAssessed: null,
  nextReview: null,
  intervalHours: 0,
  ease: 2.5,
  dims: { theory: 0, practical: 0, pentest: 0, obsHyp: 0, attackPath: 0 },
});

export interface Evidence {
  /** Overall quality 0..1. */
  score: number;
  result: Result;
  difficulty: number; // 1..5
  type: QuestionType;
  isFollowUp?: boolean;
  /** Learner graded themselves against the rubric (AI unavailable): weaker evidence. */
  selfGraded?: boolean;
  guessed?: boolean;
  /** Confidence the learner stated before feedback, 1 (guessing) .. 4 (certain). */
  predicted?: number | null;
  /** The evaluator's proposal, untrusted. */
  aiDelta?: number | null;
  scores?: Evaluation['scores'];
  now: number;
}

export type Outcome = 'success' | 'partial' | 'failure';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Level on the 0..7 scale that a question of difficulty 1..5 demonstrates. */
export const difficultyLevel = (d: number) => clamp(d, 1, 5) * 1.4;

export function outcomeOf(e: Pick<Evidence, 'score' | 'result'>): Outcome {
  if (e.result === 'correct' && e.score >= 0.6) return 'success';
  if (e.result === 'incorrect' || e.score < 0.4) return 'failure';
  return 'partial';
}

/** Overall score from the evaluator's dimension scores (correctness dominates). */
export function overallScore(s: Evaluation['scores']): number {
  return clamp(0.4 * s.correctness + 0.25 * s.conceptual_understanding + 0.2 * s.reasoning_quality + 0.1 * s.pentest_application + 0.05 * s.observation_vs_hypothesis, 0, 1);
}

/** How much this piece of evidence counts, before the current-confidence inertia. */
export function evidenceWeight(e: Evidence): number {
  let w = QUESTION_TYPE_EVIDENCE[e.type] ?? 0.8;
  if (e.isFollowUp) w *= 1.1;
  if (e.selfGraded) w *= 0.5;
  return w;
}

/** Signed change in mastery (already clamped to ±MAX_STEP). */
export function masteryDelta(state: MasteryState, e: Evidence): number {
  const level = difficultyLevel(e.difficulty);
  const perf = clamp(e.score, 0, 1) - 0.55;
  let raw: number;
  if (perf >= 0) {
    // Answering well below your level teaches us little; above it, a lot.
    const headroom = clamp((level + 0.7 - state.mastery) / 2, 0.1, 1);
    raw = (perf / 0.45) * headroom;
    if (e.guessed || e.predicted === 1) raw *= 0.4; // a lucky guess is weak evidence
    if (!state.typesSeen.includes(e.type) && state.attempts > 0) raw *= 1.15; // transfer to a new context
  } else {
    // Failing something easy for your level is strong evidence; failing a stretch question is not.
    const exposure = clamp((state.mastery - level + 2.1) / 3, 0.25, 1);
    raw = (perf / 0.55) * exposure;
  }
  const inertia = 1 - 0.4 * state.confidence;
  const weight = evidenceWeight(e) * inertia;
  const own = raw * MAX_STEP * weight;

  let delta = own;
  if (e.aiDelta != null && Number.isFinite(e.aiDelta)) {
    const ai = clamp(e.aiDelta, -MAX_STEP, MAX_STEP) * weight;
    // The proposal may refine the size of the step, never flip its direction.
    if (own === 0 || Math.sign(ai) === Math.sign(own)) delta = 0.6 * own + 0.4 * ai;
  }
  delta = clamp(delta, -MAX_STEP, MAX_STEP);
  return clamp(state.mastery + delta, 0, MAX_MASTERY) - state.mastery;
}

/** Whether this attempt counts as a spaced-review check (the concept was due). */
export const isReviewAttempt = (state: MasteryState, now: number) => state.nextReview != null && now >= state.nextReview;

/** Confidence in the mastery estimate. Grows only with success across distinct types/difficulties. */
export function nextConfidence(state: MasteryState, e: Evidence, outcome: Outcome): number {
  const c = state.confidence;
  const w = evidenceWeight(e);
  if (outcome === 'failure') {
    // A confident wrong answer is an illusion of knowing: trust the estimate even less.
    const illusion = e.predicted === 4 ? 0.1 : e.predicted === 3 ? 0.05 : 0;
    return clamp(c - (isReviewAttempt(state, e.now) ? 0.25 : 0.12) - illusion, 0, MAX_CONFIDENCE);
  }
  if (outcome === 'partial') return clamp(c - 0.02, 0, MAX_CONFIDENCE);
  const newContext = !state.typesSeen.includes(e.type) || e.difficulty > state.maxDiffPassed;
  const gain = (newContext ? 0.12 : 0.04) * w;
  const types = new Set([...state.typesSeen, e.type]).size;
  const cap = Math.min(MAX_CONFIDENCE, 0.3 + 0.15 * (types - 1) + 0.05 * Math.min(4, state.maxDiffPassed));
  // Never lower confidence on success, even if the cap is below the current value.
  return clamp(Math.max(c, Math.min(cap, c + gain)), 0, MAX_CONFIDENCE);
}

const REASONING_TYPES = new Set<QuestionType>(['attack-path', 'decision', 'scenario', 'investigate-next', 'failing-assumption', 'troubleshoot']);

export function nextDims(state: MasteryState, e: Evidence): Dims {
  const s = e.scores ?? {
    correctness: e.score,
    conceptual_understanding: e.score,
    reasoning_quality: e.score,
    pentest_application: e.score,
    observation_vs_hypothesis: e.score,
  };
  const base = clamp(Math.max(0.3 * evidenceWeight(e), 1 / (state.attempts + 1)), 0, 1);
  const ema = (old: number, x: number, a = base) => clamp(old + (clamp(x, 0, 1) - old) * a, 0, 1);
  return {
    theory: ema(state.dims.theory, s.conceptual_understanding),
    practical: ema(state.dims.practical, s.correctness),
    pentest: ema(state.dims.pentest, s.pentest_application),
    obsHyp: ema(state.dims.obsHyp, s.observation_vs_hypothesis),
    attackPath: ema(state.dims.attackPath, s.reasoning_quality, REASONING_TYPES.has(e.type) ? base : base * 0.5),
  };
}

/** Applies one piece of evidence. Scheduling is left to the scheduler. */
export function applyEvidence(state: MasteryState, e: Evidence): { state: MasteryState; delta: number; outcome: Outcome; review: boolean } {
  const outcome = outcomeOf(e);
  const delta = masteryDelta(state, e);
  const next: MasteryState = {
    ...state,
    mastery: state.mastery + delta,
    confidence: nextConfidence(state, e, outcome),
    attempts: state.attempts + 1,
    successStreak: outcome === 'success' ? state.successStreak + 1 : 0,
    failStreak: outcome === 'failure' ? state.failStreak + 1 : outcome === 'success' ? 0 : state.failStreak,
    maxDiffPassed: outcome === 'success' ? Math.max(state.maxDiffPassed, e.difficulty) : state.maxDiffPassed,
    typesSeen: state.typesSeen.includes(e.type) ? state.typesSeen : [...state.typesSeen, e.type],
    lastAssessed: e.now,
    dims: nextDims(state, e),
  };
  return { state: next, delta, outcome, review: isReviewAttempt(state, e.now) };
}

/** Human-readable band for prompts. The raw number is never sent to the model or shown by default. */
export function masteryBand(m: number): string {
  const bands = ['Unknown', 'Familiar', 'Basic understanding', 'Working knowledge', 'Strong', 'Proficient', 'Advanced', 'Expert-level reasoning'];
  return bands[clamp(Math.floor(m + 0.25), 0, 7)]!;
}
