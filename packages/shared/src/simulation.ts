import { z } from 'zod';
import type { SimDebrief, SimPhase } from './schemas';

/**
 * Pentest Simulation API. The world model stays on the server; the client only sees
 * what the student has uncovered (transcript + discovered graph nodes).
 *
 *  GET  /api/simulations                    → SimulationSummaryDTO[]  (newest first)
 *  POST /api/simulations    body StartSimulationRequest → SimulationDTO
 *  GET  /api/simulations/:id                → SimulationDTO
 *  POST /api/simulations/:id/action  body SimActionRequest → SimulationDTO
 *  POST /api/simulations/:id/end   body EndSimulationRequest → SimulationDTO (status "ended", debrief set; retry if debrief is null)
 *  DELETE /api/simulations/:id              → { ok: true }
 * Errors: JSON { message, kind? } — AI failures use HTTP 429 (quota) / 503 with kind.
 * A failed action is not recorded, so the same action can simply be retried.
 */
export const StartSimulationRequest = z.object({
  /** A domain id, an area id, or '' for a mixed engagement. */
  focus: z.string().max(60).default(''),
  difficulty: z.coerce.number().int().min(1).max(5).default(3),
});
export type StartSimulationRequest = z.infer<typeof StartSimulationRequest>;

/** POST /api/simulations/:id/end body. The learner debriefs themselves before seeing the coach's debrief. */
export const EndSimulationRequest = z.object({ selfDebrief: z.string().trim().max(6000).default('') });
export type EndSimulationRequest = z.infer<typeof EndSimulationRequest>;

export const SimActionRequest = z.object({ action: z.string().trim().min(1).max(4000) });
export type SimActionRequest = z.infer<typeof SimActionRequest>;

export type SimLoopStage = 'observation' | 'hypothesis' | 'test' | 'evidence' | 'conclusion';
export const SIM_LOOP: { key: SimLoopStage; label: string; short: string }[] = [
  { key: 'observation', label: 'Observation', short: 'O' },
  { key: 'hypothesis', label: 'Hypothesis', short: 'H' },
  { key: 'test', label: 'Test', short: 'T' },
  { key: 'evidence', label: 'Evidence', short: 'E' },
  { key: 'conclusion', label: 'Conclusion', short: 'C' },
];

export interface SimTranscriptEntry {
  id: number;
  role: 'user' | 'system';
  content: string;
  at: number;
  /** System entries only. */
  mentorNote?: string;
  phase?: SimPhase;
  reasoning?: { actionQuality: number; reasoningQuality: number; stages: SimLoopStage[] };
  objectiveCompleted?: string | null;
}

export interface SimGraphNode {
  id: string;
  kind: 'host' | 'service' | 'finding' | 'credential' | 'objective';
  label: string;
  parent: string | null;
  /** Transcript entry id that revealed this node. */
  discoveredAt: number;
}

export interface SimulationDTO {
  id: string;
  title: string;
  briefing: string;
  scope: string;
  attackerModel: string;
  credentials: string;
  timeLimitMinutes: number;
  difficulty: number;
  focus: string;
  startedAt: number;
  endedAt: number | null;
  status: 'active' | 'ended';
  phase: SimPhase;
  /** Phases reached so far, in the order first reached. */
  phasesReached: SimPhase[];
  objectives: { text: string; done: boolean }[];
  transcript: SimTranscriptEntry[];
  graph: SimGraphNode[];
  /** How often each reasoning-loop stage showed up in the student's actions (0..1 share of actions). */
  loop: Record<SimLoopStage, number>;
  actions: number;
  /** The simulator judged the engagement complete; the client should offer the debrief. */
  engagementOver: boolean;
  debrief: SimDebrief | null;
  /** The learner's own debrief, written before seeing the coach's. */
  selfDebrief: string | null;
  /** Revealed only after the engagement ends. */
  reveal: { intendedChain: string[]; vulnerabilities: { title: string; host: string; detail: string }[] } | null;
}

export interface SimulationSummaryDTO {
  id: string;
  title: string;
  difficulty: number;
  focus: string;
  startedAt: number;
  endedAt: number | null;
  status: 'active' | 'ended';
  phase: SimPhase;
  actions: number;
  overall: number | null;
}
