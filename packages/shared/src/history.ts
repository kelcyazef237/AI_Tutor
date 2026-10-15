import type { QuestionType, SessionMode } from './schemas';
import type { SessionReflection } from './session';

export type Result = 'correct' | 'partial' | 'incorrect';

/** GET /api/sessions — one row per session, newest first. */
export interface SessionSummaryDTO {
  id: string;
  mode: SessionMode;
  startedAt: number;
  endedAt: number | null;
  total: number;
  answered: number;
  results: Record<Result, number>;
  /** Sum of mastery changes across attempts, on the 0..1 display scale. */
  masteryChange: number;
  concepts: string[];
  reflection: SessionReflection | null;
}

/** GET /api/sessions/:id/attempts — graded answers in order. */
export interface AttemptDTO {
  id: string;
  conceptId: string;
  conceptName: string;
  type: QuestionType;
  difficulty: number;
  isFollowUp: boolean;
  selfGraded: boolean;
  result: Result | null;
  score: number | null;
  /** 0..7 internal scale. */
  masteryBefore: number | null;
  masteryAfter: number | null;
  createdAt: number;
  durationMs: number | null;
  prompt: string;
  answer: string;
  feedback: string;
  /** Stated confidence 1..4 before feedback, if given. */
  predicted: number | null;
}
