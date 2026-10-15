import type { EvaluationDTO, PublicQuestion, SessionDTO, SessionEndDTO, SessionMode, Settings } from '@psc/shared';

/** Generic placeholder fixtures. No teaching content: ids are taxonomy identifiers only. */

export function question(over: Partial<PublicQuestion> = {}): PublicQuestion {
  return {
    id: 'q1',
    conceptId: 'net.osi',
    conceptName: 'Placeholder concept',
    domainName: 'Placeholder domain',
    secondaryConcepts: [],
    type: 'conceptual',
    difficulty: 2,
    prompt: 'Placeholder question text',
    objective: 'Placeholder objective',
    estMinutes: 3,
    source: 'curated',
    isFollowUp: false,
    bucket: 'weak',
    ...over,
  };
}

export function session(over: Partial<SessionDTO> = {}): SessionDTO {
  return {
    id: 's1',
    mode: 'quick',
    startedAt: Date.now() - 60_000,
    endedAt: null,
    total: 2,
    answered: 0,
    greeting: 'Placeholder greeting',
    current: question(),
    plan: [],
    feedbackMode: 'immediate',
    ...over,
  };
}

export function evaluation(over: Partial<EvaluationDTO> = {}): EvaluationDTO {
  return {
    attemptId: 'a1',
    result: 'partial',
    scores: { correctness: 0.6, conceptual_understanding: 0.5, reasoning_quality: 0.7, pentest_application: 0.4, observation_vs_hypothesis: 0.5 },
    feedback: 'Placeholder feedback',
    misconceptions: ['Placeholder misconception'],
    missingPoints: ['Placeholder missing point'],
    conceptsDemonstrated: [],
    followUp: null,
    masteryBefore: 3.5,
    masteryAfter: 4.2,
    confidenceAfter: 0.5,
    nextReview: Date.now() + 3 * 86_400_000,
    rubric: { keyPoints: ['Placeholder key point'], misconceptions: [], referenceAnswer: 'Placeholder reference answer' },
    selfGraded: false,
    ...over,
  };
}

export function endData(mode: SessionMode = 'quick', over: Partial<SessionEndDTO> = {}): SessionEndDTO {
  return {
    summary: {
      id: 's1',
      mode,
      startedAt: Date.now() - 600_000,
      endedAt: Date.now(),
      total: 2,
      answered: 2,
      results: { correct: 1, partial: 1, incorrect: 0 },
      masteryChange: 0.05,
      concepts: ['Placeholder concept'],
      reflection: null,
    },
    evaluations: [],
    masteryChanges: [{ conceptId: 'net.osi', conceptName: 'Placeholder concept', before: 3.5, after: 4.2 }],
    newMisconceptions: [{ conceptName: 'Placeholder concept', text: 'Placeholder misconception' }],
    ...over,
  };
}

export function settings(over: Partial<Settings> = {}): Settings {
  return {
    provider: 'mock',
    ollamaUrl: '',
    openaiUrl: '',
    openaiKey: '',
    models: { generator: 'm', evaluator: 'm', simulator: 'm' },
    fallbackModels: [],
    temperature: 0.4,
    preferGenerated: 0.5,
    showInternalScale: false,
    dailyGoal: 10,
    weeklyGoal: 50,
    sessionReminder: '',
    studyDays: [],
    objective: 'all',
    preferredMode: 'standard',
    focusDomains: [],
    learnerName: 'Placeholder name',
    learningGoal: 'Placeholder goal',
    ...over,
  };
}

/* ── Dashboard / analytics fixtures (replace the old preview data in tests) ── */
import { AREAS, CONCEPTS, type ConceptStateDTO, type DashboardDTO, type SessionSummaryDTO } from '@psc/shared';

const dayKeyOf = (ageDays: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ageDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function dashboard(over: Partial<DashboardDTO> = {}): DashboardDTO {
  const pick = (i: number) => CONCEPTS[i % CONCEPTS.length]!;
  const areas = AREAS.map((a, i) => {
    const total = CONCEPTS.filter((c) => c.area === a.id).length;
    return { id: a.id, name: a.name, mastery: 0.3 + i * 0.05, confidence: 0.3 + i * 0.04, assessed: Math.max(1, Math.round(total * 0.4)), total };
  });
  const activity = Array.from({ length: 182 }, (_, i) => {
    const age = 181 - i;
    const q = age < 10 ? 6 : age % 3 === 0 ? 4 : 0;
    return { day: dayKeyOf(age), questions: q, correct: Math.round(q * 0.6) };
  });
  const base: DashboardDTO = {
    generatedAt: Date.now(),
    stats: { streak: 4, longestStreak: 9, today: 6, dailyGoal: 10, week: 38, weeklyGoal: 50, dueNow: 5, activeMisconceptions: 3, conceptsAssessed: 40, totalConcepts: CONCEPTS.length },
    areas,
    trend: Array.from({ length: 10 }, (_, i) => ({ day: dayKeyOf(9 - i), overall: 0.4 + i * 0.02 })),
    activity,
    forecast: Array.from({ length: 14 }, (_, i) => ({ day: dayKeyOf(-i), count: i % 4 })),
    overdue: 2,
    weakest: [0, 1, 2, 3].map((i) => ({ conceptId: pick(i).id, name: pick(i).name, domainName: pick(i).domainName, mastery: 0.1 + i * 0.05, confidence: 0.3 })),
    improving: [4, 5].map((i) => ({ conceptId: pick(i).id, name: pick(i).name, domainName: pick(i).domainName, mastery: 0.5, delta: 0.1 })),
    atRisk: [6].map((i) => ({ conceptId: pick(i).id, name: pick(i).name, domainName: pick(i).domainName, mastery: 0.5, overdueDays: 4 })),
    misconceptions: [7, 8].map((i, j) => ({ id: `m${j}`, conceptId: pick(i).id, conceptName: pick(i).name, text: 'Placeholder misconception', occurrences: 2, lastSeen: Date.now() })),
    recent: [9, 10].map((i, j) => ({ attemptId: `a${j}`, conceptName: pick(i).name, type: 'scenario' as const, difficulty: 2, result: 'correct' as const, at: Date.now() })),
    recommendation: { mode: 'standard', title: 'Keep the momentum', reason: 'Placeholder reason', concepts: [pick(0).name] },
    calibration: {
      levels: [
        { level: 1, label: 'Guessing', expected: 0.25, answers: 10, score: 0.3 },
        { level: 2, label: 'Unsure', expected: 0.5, answers: 20, score: 0.45 },
        { level: 3, label: 'Fairly sure', expected: 0.75, answers: 30, score: 0.6 },
        { level: 4, label: 'Certain', expected: 0.95, answers: 12, score: 0.75 },
      ],
      rated: 72,
      bias: 0.12,
      confidentErrors: [11, 12, 13].map((i, j) => ({ attemptId: `ce${j}`, conceptId: pick(i).id, conceptName: pick(i).name, predicted: j ? 3 : 4, at: Date.now() - j * 3_600_000 })),
    },
    retention: { delayed: { answers: 30, score: 0.6 }, firstTime: { answers: 44, score: 0.72 } },
  };
  return { ...base, ...over };
}

export function conceptStates(): ConceptStateDTO[] {
  const statuses: ConceptStateDTO['status'][] = ['unknown', 'learning', 'review-due', 'at-risk', 'solid'];
  return CONCEPTS.map((c, i) => {
    const status = statuses[i % statuses.length]!;
    const assessed = status !== 'unknown';
    return {
      conceptId: c.id, name: c.name, domainId: c.domainId, domainName: c.domainName, area: c.area,
      mastery: assessed ? 2 + (i % 5) : 0, confidence: assessed ? 0.4 : 0, attempts: assessed ? 1 + (i % 4) : 0,
      successStreak: assessed ? i % 3 : 0, failStreak: 0, maxDifficultyPassed: assessed ? 2 : 0,
      lastAssessed: assessed ? Date.now() - i * 3_600_000 : null,
      nextReview: status === 'review-due' || status === 'at-risk' ? Date.now() - 3_600_000 : assessed ? Date.now() + 86_400_000 : null,
      intervalHours: assessed ? 48 : 0,
      dims: { theory: 0.5, practical: 0.5, pentest: 0.4, obsHyp: 0.4, attackPath: 0.4 },
      status,
    };
  });
}

export function sessionSummaries(): SessionSummaryDTO[] {
  return [0, 1, 2].map((i) => ({
    id: `s${i}`, mode: 'standard' as const, startedAt: Date.now() - i * 86_400_000, endedAt: Date.now() - i * 86_400_000 + 600_000,
    total: 10, answered: 10, results: { correct: 6, partial: 2, incorrect: 2 }, masteryChange: 0.05, concepts: ['Placeholder concept'], reflection: null,
  }));
}
