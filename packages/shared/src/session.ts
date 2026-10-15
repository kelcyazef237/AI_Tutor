import { z } from 'zod';
import type { EvaluationDTO, Rubric, SessionDTO } from './schemas';
import type { SessionSummaryDTO } from './history';

/**
 * Session runner API (backend not built yet; the frontend is written against this contract).
 *
 *  POST /api/sessions                    body StartSessionRequest  → SessionDTO   (current = first question)
 *  GET  /api/sessions/:id                                          → SessionDTO   (resume; current may be null when finished)
 *  POST /api/sessions/:id/answer         body AnswerRequest        → AnswerResponse
 *  POST /api/sessions/:id/next                                     → SessionDTO   (advance after feedback; current=null when done)
 *  POST /api/attempts/:id/self-grade     body SelfGradeRequest     → EvaluationDTO (selfGraded=true)
 *  POST /api/sessions/:id/end                                      → SessionEndDTO (also valid early: ends the session)
 *
 * Flow per question:
 *  1. Show SessionDTO.current. User answers (or skips) → POST /answer.
 *  2. AnswerResponse.kind:
 *     - "evaluated": show evaluation.feedback etc. If evaluation.followUp is set, the next
 *        thing to answer is that follow-up (POST /answer with followUp.id). Otherwise POST /next.
 *     - "needs_self_grade": the AI is unavailable. Show `rubric`, let the user grade 0..1
 *        (e.g. buttons: Missed it 0 / Partly 0.5 / Nailed it 1) → POST /attempts/:id/self-grade, then POST /next.
 *     - "recorded": exam mode (feedback at end) — go straight to POST /next.
 *  3. When SessionDTO.current is null → POST /end and show the summary.
 * Errors: JSON { message, kind? } — kind "quota" | "unavailable" | ... for AI failures (HTTP 429/503).
 */
/**
 * Confidence the learner states *before* seeing feedback (calibration, "illusions of knowing").
 * `expected` is the share of answers at that level that should be right if the learner is well calibrated.
 */
export const CONFIDENCE_LEVELS = [
  { value: 1, label: 'Guessing', expected: 0.25 },
  { value: 2, label: 'Unsure', expected: 0.5 },
  { value: 3, label: 'Fairly sure', expected: 0.75 },
  { value: 4, label: 'Certain', expected: 0.95 },
] as const;
export const confidenceLabel = (v: number | null | undefined) => CONFIDENCE_LEVELS.find((l) => l.value === v)?.label ?? null;

export const AnswerRequest = z.object({
  questionId: z.string(),
  answer: z.string().max(20_000),
  durationMs: z.number().int().nonnegative(),
  skipped: z.boolean().default(false),
  /** 1..4, see CONFIDENCE_LEVELS. Omitted when skipped. */
  confidence: z.number().int().min(1).max(4).nullish(),
});
export type AnswerRequest = z.infer<typeof AnswerRequest>;

/** PUT /api/sessions/:id/reflection — short end-of-session reflection (retrieval + elaboration). */
export const SessionReflection = z.object({
  wentWell: z.string().trim().max(4000).default(''),
  change: z.string().trim().max(4000).default(''),
  connects: z.string().trim().max(4000).default(''),
});
export type SessionReflection = z.infer<typeof SessionReflection>;
export const REFLECTION_PROMPTS: { key: keyof SessionReflection; label: string; hint: string }[] = [
  { key: 'wentWell', label: 'What went well?', hint: 'Which ideas could you retrieve and explain confidently?' },
  { key: 'change', label: 'What would you do differently?', hint: 'Where did your reasoning break down, and what will you check next time?' },
  { key: 'connects', label: 'What does this connect to?', hint: 'Link it to something you already know, a past engagement, or another domain.' },
];

export const SelfGradeRequest = z.object({ score: z.number().min(0).max(1) });
export type SelfGradeRequest = z.infer<typeof SelfGradeRequest>;

export type AnswerResponse =
  | { kind: 'evaluated'; evaluation: EvaluationDTO; session: SessionDTO }
  | { kind: 'needs_self_grade'; attemptId: string; rubric: Rubric; reason: string; session: SessionDTO }
  | { kind: 'recorded'; attemptId: string; session: SessionDTO };

export interface SessionEndDTO {
  summary: SessionSummaryDTO;
  /** All evaluations in order (in exam mode this is the first time feedback is shown). */
  evaluations: (EvaluationDTO & { conceptName: string; prompt: string })[];
  /** Concepts whose mastery moved, on the 0..7 scale. */
  masteryChanges: { conceptId: string; conceptName: string; before: number; after: number }[];
  newMisconceptions: { conceptName: string; text: string }[];
}
