import { z } from 'zod';

/**
 * Free recall ("brain dump"): write everything you remember about a domain on a blank page,
 * then see what you produced, what you missed and what you got wrong. Missed concepts you have
 * studied before are pulled forward for review.
 *
 *  GET  /api/recall                         → RecallDTO[] (newest first)
 *  POST /api/recall        body StartRecallRequest → RecallDTO (status "writing")
 *  GET  /api/recall/:id                     → RecallDTO
 *  POST /api/recall/:id/submit  body SubmitRecallRequest → SubmitRecallResponse
 *        AI available: status "reviewed". AI unavailable: { kind: "needs_self_check" } — show the
 *        concept checklist and POST /api/recall/:id/self-check.
 *  POST /api/recall/:id/self-check body SelfCheckRequest → RecallDTO (status "reviewed", selfChecked)
 */
export const RECALL_MINUTES = 10;

export const RECALL_LEVELS = ['none', 'partial', 'solid'] as const;
export type RecallLevel = (typeof RECALL_LEVELS)[number];
export const RECALL_LABEL: Record<RecallLevel, string> = { none: 'Not recalled', partial: 'Partly recalled', solid: 'Recalled well' };

export const StartRecallRequest = z.object({ domainId: z.string().min(1) });
export const SubmitRecallRequest = z.object({ text: z.string().max(30_000) });
export const SelfCheckRequest = z.object({
  items: z.array(z.object({ conceptId: z.string(), recalled: z.enum(RECALL_LEVELS) })).max(200),
});

/** AI output for a recall review (validated server-side). */
const strArr = z.array(z.coerce.string()).catch([]).default([]);
export const RecallReview = z.object({
  concepts: z
    .array(z.object({ concept: z.string(), recalled: z.enum(RECALL_LEVELS).catch('none'), note: z.string().catch('') }))
    .catch([]),
  errors: z.array(z.object({ concept: z.string(), text: z.string() })).catch([]),
  connections: strArr,
  feedback: z.string().min(1),
});
export type RecallReview = z.infer<typeof RecallReview>;

export interface RecallConceptResult {
  conceptId: string;
  conceptName: string;
  recalled: RecallLevel;
  note: string;
  /** Concept had been studied before and is now due for review because it was missed. */
  scheduled: boolean;
}

export interface RecallDTO {
  id: string;
  domainId: string;
  domainName: string;
  startedAt: number;
  submittedAt: number | null;
  minutes: number;
  status: 'writing' | 'reviewed';
  text: string;
  selfChecked: boolean;
  result: {
    concepts: RecallConceptResult[];
    errors: { conceptId: string; conceptName: string; text: string }[];
    connections: string[];
    feedback: string;
  } | null;
}

export type SubmitRecallResponse = { kind: 'reviewed'; recall: RecallDTO } | { kind: 'needs_self_check'; reason: string; recall: RecallDTO };
