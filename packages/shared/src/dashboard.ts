import type { AreaId } from './taxonomy';
import type { QuestionType, SessionMode } from './schemas';

/** Response contract for GET /api/dashboard. All mastery/confidence values are 0..1. */
export interface DashboardDTO {
  generatedAt: number;
  stats: {
    streak: number;
    longestStreak: number;
    today: number;
    dailyGoal: number;
    week: number;
    weeklyGoal: number;
    dueNow: number;
    activeMisconceptions: number;
    conceptsAssessed: number;
    totalConcepts: number;
  };
  areas: { id: AreaId; name: string; mastery: number; confidence: number; assessed: number; total: number }[];
  /** Daily average mastery across assessed concepts, oldest first. */
  trend: { day: string; overall: number }[];
  /** One entry per day for the last 182 days, oldest first. */
  activity: { day: string; questions: number; correct: number }[];
  /** Reviews scheduled per day for the next 14 days (today first). */
  forecast: { day: string; count: number }[];
  overdue: number;
  weakest: { conceptId: string; name: string; domainName: string; mastery: number; confidence: number }[];
  improving: { conceptId: string; name: string; domainName: string; mastery: number; delta: number }[];
  atRisk: { conceptId: string; name: string; domainName: string; mastery: number; overdueDays: number }[];
  misconceptions: { id: string; conceptId: string; conceptName: string; text: string; occurrences: number; lastSeen: number }[];
  recent: { attemptId: string; conceptName: string; type: QuestionType; difficulty: number; result: 'correct' | 'partial' | 'incorrect'; at: number }[];
  recommendation: { mode: SessionMode; title: string; reason: string; concepts: string[] };
  /** Stated confidence vs. actual results over the last 90 days. */
  calibration: CalibrationDTO;
  /**
   * Retention: results on concepts when they came back due for review (delayed retrieval, a good
   * signal of learning) vs. the first time they were asked (immediate, a weak signal). Scores are 0..1.
   */
  retention: { delayed: { answers: number; score: number | null }; firstTime: { answers: number; score: number | null } };
}

export interface CalibrationDTO {
  /** One row per confidence level (1..4). `score` is the mean graded score (0..1), null with no answers. */
  levels: { level: number; label: string; expected: number; answers: number; score: number | null }[];
  rated: number;
  /** Mean of (expected − actual): > 0 overconfident, < 0 underconfident. Null with too few answers. */
  bias: number | null;
  /** Answers rated "Fairly sure"/"Certain" that were wrong: the illusions of knowing to fix first. */
  confidentErrors: { attemptId: string; conceptId: string; conceptName: string; predicted: number; at: number }[];
}
