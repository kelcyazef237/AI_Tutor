import { z } from 'zod';
import { QuestionDef } from './schemas';
import { CONCEPT_BY_ID } from './taxonomy';

export const QUESTION_SOURCES = ['imported', 'custom', 'generated', 'followup'] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

/** A question as authored or imported. `id` is optional on create/import (the server assigns one). */
export const QuestionInput = QuestionDef.extend({ id: z.string().min(1).max(100).optional() }).refine((q) => !!CONCEPT_BY_ID[q.conceptId], {
  message: 'Unknown conceptId (must match a concept id from the taxonomy, e.g. "net.tcp")',
  path: ['conceptId'],
});
export type QuestionInput = z.infer<typeof QuestionInput>;

/** Row returned by the questions API. */
export interface QuestionRecordDTO {
  id: string;
  source: QuestionSource;
  question: QuestionDef;
  timesAsked: number;
  lastAsked: number | null;
  createdAt: number;
}

/**
 * Endpoints:
 *  GET    /api/questions?source=&conceptId=&q=   → QuestionRecordDTO[]  (newest first)
 *  POST   /api/questions          body QuestionInput            → QuestionRecordDTO (source "custom")
 *  PUT    /api/questions/:id      body QuestionInput            → QuestionRecordDTO
 *  DELETE /api/questions/:id                                    → { ok: true }
 *  POST   /api/questions/import   body { questions: unknown[] } → ImportResultDTO
 *  GET    /api/questions/export                                 → QuestionDef[] (imported + custom only)
 * Errors: 4xx/5xx with JSON { message: string }.
 */
export interface ImportResultDTO {
  imported: number;
  updated: number;
  errors: { index: number; message: string }[];
}
