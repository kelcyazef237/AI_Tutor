import { z } from 'zod';

/* ───────────────────────── Enums ───────────────────────── */

export const DIFFICULTIES = ['FOUNDATION', 'WORKING', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;
/** 1..5 numeric difficulty; index into DIFFICULTIES with (d-1). */
export const Difficulty = z.coerce.number().int().min(1).max(5);
export type Difficulty = z.infer<typeof Difficulty>;
export const difficultyName = (d: number) => DIFFICULTIES[Math.min(4, Math.max(0, Math.round(d) - 1))]!;

export const QUESTION_TYPES = [
  'conceptual',
  'explain',
  'scenario',
  'decision',
  'command',
  'packet',
  'code-review',
  'vuln-id',
  'attack-path',
  'compare',
  'troubleshoot',
  'investigate-next',
  'failing-assumption',
  'why-vuln',
  'tool-selection',
] as const;
export const QuestionType = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof QuestionType>;

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  conceptual: 'Conceptual',
  explain: 'Explain in your own words',
  scenario: 'Scenario reasoning',
  decision: 'Pentest decision-making',
  command: 'Command interpretation',
  packet: 'Traffic interpretation',
  'code-review': 'Code review',
  'vuln-id': 'Vulnerability identification',
  'attack-path': 'Attack-path reasoning',
  compare: 'Compare / contrast',
  troubleshoot: 'Troubleshooting',
  'investigate-next': 'What would you investigate next?',
  'failing-assumption': 'What assumption is failing?',
  'why-vuln': 'Why does this vulnerability exist?',
  'tool-selection': 'Tool selection',
};

/** Evidence strength of a question type (weak → strong). Used by the mastery engine. */
export const QUESTION_TYPE_EVIDENCE: Record<QuestionType, number> = {
  conceptual: 0.5,
  explain: 0.7,
  compare: 0.75,
  command: 0.8,
  packet: 0.9,
  'tool-selection': 0.8,
  scenario: 1,
  decision: 1,
  'code-review': 1,
  'vuln-id': 0.9,
  troubleshoot: 1,
  'investigate-next': 1,
  'failing-assumption': 1.05,
  'why-vuln': 1.05,
  'attack-path': 1.1,
};

export const SESSION_MODES = ['quick', 'standard', 'deep', 'exam', 'weakness', 'review', 'challenge'] as const;
export const SessionMode = z.enum(SESSION_MODES);
export type SessionMode = z.infer<typeof SessionMode>;

export interface ModeInfo {
  id: SessionMode | 'simulation';
  name: string;
  blurb: string;
  count: number;
  feedback: 'immediate' | 'end';
  followUps: boolean;
}

export const MODES: Record<SessionMode | 'simulation', ModeInfo> = {
  quick: { id: 'quick', name: 'Quick Session', blurb: '5 adaptive questions. Keep the streak alive.', count: 5, feedback: 'immediate', followUps: true },
  standard: { id: 'standard', name: 'Standard Session', blurb: '10 questions balanced across weak areas, reinforcement and new material.', count: 10, feedback: 'immediate', followUps: true },
  deep: { id: 'deep', name: 'Deep Session', blurb: '20 questions. Serious study block with cross-domain reasoning.', count: 20, feedback: 'immediate', followUps: true },
  exam: { id: 'exam', name: 'Examination', blurb: 'Randomized assessment. No hints, no follow-ups, feedback at the end.', count: 12, feedback: 'end', followUps: false },
  weakness: { id: 'weakness', name: 'Weakness Hunt', blurb: 'Concentrated on your weakest concepts and active misconceptions.', count: 8, feedback: 'immediate', followUps: true },
  review: { id: 'review', name: 'Review', blurb: 'Only due, failed or weak concepts from your review queue.', count: 10, feedback: 'immediate', followUps: true },
  challenge: { id: 'challenge', name: 'Challenge', blurb: 'High-difficulty cross-domain reasoning. Expect to struggle.', count: 6, feedback: 'immediate', followUps: true },
  simulation: { id: 'simulation', name: 'Pentest Simulation', blurb: 'A simulated engagement. You decide, the target responds, your reasoning is scored.', count: 0, feedback: 'immediate', followUps: false },
};

/* ───────────────────────── Questions ───────────────────────── */

export const ArtifactKind = z.enum(['code', 'terminal', 'http', 'packet', 'dns', 'log', 'config']);
export type ArtifactKind = z.infer<typeof ArtifactKind>;

export const Artifact = z.object({
  kind: ArtifactKind,
  language: z.string().optional(),
  title: z.string().optional(),
  content: z.string(),
});
export type Artifact = z.infer<typeof Artifact>;

export const Rubric = z.object({
  keyPoints: z.array(z.string()).default([]),
  misconceptions: z.array(z.string()).default([]),
  referenceAnswer: z.string().default(''),
});
export type Rubric = z.infer<typeof Rubric>;

export const QuestionDef = z.object({
  id: z.string(),
  conceptId: z.string(),
  secondaryConcepts: z.array(z.string()).default([]),
  type: QuestionType,
  difficulty: Difficulty,
  prompt: z.string(),
  artifact: Artifact.optional(),
  objective: z.string(),
  depth: z.coerce.number().int().min(1).max(3).default(2),
  estMinutes: z.coerce.number().min(1).max(30).default(3),
  rubric: Rubric,
});
export type QuestionDef = z.infer<typeof QuestionDef>;

/** What the client sees (rubric is withheld until after grading). */
export interface PublicQuestion {
  id: string;
  conceptId: string;
  conceptName: string;
  domainName: string;
  secondaryConcepts: string[];
  type: QuestionType;
  difficulty: number;
  prompt: string;
  artifact?: Artifact;
  objective: string;
  estMinutes: number;
  source: 'curated' | 'generated';
  isFollowUp: boolean;
  bucket?: Bucket;
}

export const BUCKETS = ['weak', 'review', 'new', 'reinforce', 'cross', 'challenge', 'prereq'] as const;
export type Bucket = (typeof BUCKETS)[number];

/* ───────────────────────── AI outputs ───────────────────────── */

const unit = z.coerce.number().transform((n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n > 1 && n <= 100 ? n / 100 : n)) : 0));
const strArr = z.array(z.coerce.string()).catch([]).default([]);

/** AI-generated question (validated before persisting). */
export const GeneratedQuestion = z.object({
  type: QuestionType.catch('scenario'),
  difficulty: Difficulty.catch(2),
  prompt: z.string().min(10),
  artifact: Artifact.nullish().catch(undefined),
  objective: z.string().catch('Assess understanding'),
  estMinutes: z.coerce.number().catch(3),
  secondaryConcepts: strArr,
  rubric: z.object({
    keyPoints: strArr,
    misconceptions: strArr,
    referenceAnswer: z.string().catch(''),
  }),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestion>;

export const RecommendedAction = z.enum(['advance', 'follow_up', 'review_prerequisite']);

export const Evaluation = z.object({
  result: z.enum(['correct', 'partial', 'incorrect']).catch('partial'),
  scores: z.object({
    correctness: unit.catch(0.5),
    conceptual_understanding: unit.catch(0.5),
    reasoning_quality: unit.catch(0.5),
    pentest_application: unit.catch(0.5),
    observation_vs_hypothesis: unit.catch(0.5),
  }),
  confidence: unit.catch(0.5),
  guessed: z.coerce.boolean().catch(false),
  understands_mechanism: z.coerce.boolean().catch(false),
  misconceptions: strArr,
  concepts_demonstrated: strArr,
  concepts_to_review: strArr,
  missing_points: strArr,
  recommended_action: RecommendedAction.catch('advance'),
  follow_up_question: z.string().nullish().catch(null),
  mastery_delta: z.coerce.number().catch(0),
  feedback: z.string().min(1),
});
export type Evaluation = z.infer<typeof Evaluation>;

/* ───────────────────────── Simulation ───────────────────────── */

export const SIM_PHASES = ['recon', 'enumeration', 'hypothesis', 'testing', 'initial-access', 'privesc', 'lateral', 'impact'] as const;
export const SimPhase = z.enum(SIM_PHASES);
export type SimPhase = z.infer<typeof SimPhase>;
export const SIM_PHASE_LABEL: Record<SimPhase, string> = {
  recon: 'Recon',
  enumeration: 'Enumeration',
  hypothesis: 'Hypothesis',
  testing: 'Testing',
  'initial-access': 'Initial Access',
  privesc: 'Privilege Escalation',
  lateral: 'Lateral Movement',
  impact: 'Impact',
};

export const SimWorld = z.object({
  title: z.string(),
  briefing: z.string(),
  scope: z.string(),
  attackerModel: z.string(),
  credentials: z.string().catch('None'),
  timeLimitMinutes: z.coerce.number().catch(60),
  hosts: z
    .array(
      z.object({
        id: z.string(),
        hostname: z.string(),
        ip: z.string(),
        os: z.string().catch('unknown'),
        role: z.string().catch(''),
        services: z
          .array(z.object({ port: z.coerce.number(), proto: z.string().catch('tcp'), name: z.string(), version: z.string().catch(''), notes: z.string().catch('') }))
          .catch([]),
      }),
    )
    .min(1),
  vulnerabilities: z
    .array(z.object({ id: z.string(), hostId: z.string(), title: z.string(), concept: z.string().catch(''), detail: z.string(), evidenceHints: z.string().catch('') }))
    .catch([]),
  intendedChain: strArr,
  objectives: strArr,
  concepts: strArr,
});
export type SimWorld = z.infer<typeof SimWorld>;

export const GraphNodeKind = z.enum(['host', 'service', 'finding', 'credential', 'objective']);
export const SimStepOutput = z.object({
  evidence: z.string().min(1),
  mentor_note: z.string().catch(''),
  reasoning: z.object({
    action_quality: unit.catch(0.5),
    reasoning_quality: unit.catch(0.5),
    observation: z.coerce.boolean().catch(false),
    hypothesis: z.coerce.boolean().catch(false),
    test: z.coerce.boolean().catch(false),
    evidence: z.coerce.boolean().catch(false),
    conclusion: z.coerce.boolean().catch(false),
  }),
  phase: SimPhase.catch('recon'),
  discovered: z
    .array(
      z.object({
        id: z.string(),
        kind: GraphNodeKind.catch('finding'),
        label: z.string(),
        parent: z.string().nullish().catch(null),
      }),
    )
    .catch([]),
  objective_completed: z.string().nullish().catch(null),
  engagement_over: z.coerce.boolean().catch(false),
  concepts: strArr,
});
export type SimStepOutput = z.infer<typeof SimStepOutput>;

export const SimDebrief = z.object({
  summary: z.string(),
  overall: unit.catch(0.5),
  phase_scores: z.array(z.object({ phase: SimPhase, score: unit.catch(0.5), note: z.string().catch('') })).catch([]),
  strengths: strArr,
  weaknesses: strArr,
  missed_opportunities: strArr,
  reasoning_loop: z.object({ observation: unit.catch(0.5), hypothesis: unit.catch(0.5), test: unit.catch(0.5), evidence: unit.catch(0.5), conclusion: unit.catch(0.5) }),
  concept_updates: z.array(z.object({ concept: z.string(), score: unit.catch(0.5) })).catch([]),
  next_steps: strArr,
  /** How the learner's own debrief compares with what actually happened (calibration). */
  self_assessment_feedback: z.string().catch('').default(''),
});
export type SimDebrief = z.infer<typeof SimDebrief>;

/* ───────────────────────── Settings ───────────────────────── */

export const Settings = z.object({
  provider: z.enum(['ollama', 'openai', 'mock']).default('ollama'),
  ollamaUrl: z.string().default('http://127.0.0.1:11434'),
  openaiUrl: z.string().default('https://api.openai.com/v1'),
  openaiKey: z.string().default(''),
  models: z
    .object({
      generator: z.string().default('glm-5.3:cloud'),
      evaluator: z.string().default('glm-5.3:cloud'),
      simulator: z.string().default('deepseek-v4-pro:cloud'),
    })
    .default({ generator: 'glm-5.3:cloud', evaluator: 'glm-5.3:cloud', simulator: 'deepseek-v4-pro:cloud' }),
  fallbackModels: z.array(z.string()).default(['glm-5.3-flash:cloud', 'deepseek-v4.1-flash:cloud', 'kimi-k2.6:cloud']),
  temperature: z.number().min(0).max(1.5).default(0.4),
  preferGenerated: z.number().min(0).max(1).default(0.5),
  showInternalScale: z.boolean().default(false),
  dailyGoal: z.number().int().min(1).max(100).default(10),
  weeklyGoal: z.number().int().min(1).max(700).default(50),
  sessionReminder: z.string().default(''), // "HH:MM" study time, or ''
  /** Weekday numbers (0=Sun..6=Sat) the learner intends to study. */
  studyDays: z.array(z.number().int().min(0).max(6)).default([]),
  /** Study-track id (see STUDY_TRACKS); '' = custom/all. */
  objective: z.string().default('all'),
  preferredMode: SessionMode.default('standard'),
  focusDomains: z.array(z.string()).default([]),
  learnerName: z.string().default('Operator'),
  learningGoal: z.string().default('Become a competent penetration tester who reasons from evidence.'),
});
export type Settings = z.infer<typeof Settings>;
export const SettingsPatch = Settings.partial();

/* ───────────────────────── API DTOs ───────────────────────── */

export interface ConceptStateDTO {
  conceptId: string;
  name: string;
  domainId: string;
  domainName: string;
  area: string;
  mastery: number; // 0..7
  confidence: number; // 0..1
  attempts: number;
  successStreak: number;
  failStreak: number;
  maxDifficultyPassed: number;
  lastAssessed: number | null;
  nextReview: number | null;
  intervalHours: number;
  dims: Dims;
  status: 'unknown' | 'learning' | 'review-due' | 'solid' | 'at-risk';
}

/** Per-dimension scores, each 0..1. */
export interface Dims {
  theory: number;
  practical: number;
  pentest: number;
  obsHyp: number;
  attackPath: number;
}

export interface EvaluationDTO {
  attemptId: string;
  result: 'correct' | 'partial' | 'incorrect';
  scores: Evaluation['scores'];
  feedback: string;
  misconceptions: string[];
  missingPoints: string[];
  conceptsDemonstrated: string[];
  followUp: PublicQuestion | null;
  masteryBefore: number;
  masteryAfter: number;
  confidenceAfter: number;
  nextReview: number | null;
  rubric: Rubric;
  selfGraded: boolean;
  /** Confidence the learner stated before feedback (1..4), if any. */
  predicted?: number | null;
  aiError?: string;
}

/** POST /api/sessions body. Empty `domains` means all domains. */
export const StartSessionRequest = z.object({
  mode: SessionMode,
  domains: z.array(z.string()).default([]),
});
export type StartSessionRequest = z.infer<typeof StartSessionRequest>;

export interface SessionDTO {
  id: string;
  mode: SessionMode;
  startedAt: number;
  endedAt: number | null;
  total: number;
  answered: number;
  greeting: string;
  current: PublicQuestion | null;
  plan: { bucket: Bucket; conceptId: string; conceptName: string }[];
  feedbackMode: 'immediate' | 'end';
}

export interface AIStatus {
  ok: boolean;
  provider: string;
  kind?: AIErrorKind;
  message?: string;
  checkedAt: number;
}

export type AIErrorKind = 'quota' | 'unavailable' | 'invalid_output' | 'timeout' | 'auth' | 'unknown';
