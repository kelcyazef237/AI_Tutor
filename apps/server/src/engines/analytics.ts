import { AREAS, CONCEPT_BY_ID, CONCEPTS, CONFIDENCE_LEVELS, type CalibrationDTO, type DashboardDTO, type QuestionType, type Result, type SessionMode } from '@psc/shared';
import { dayKey, type DB } from '../db';
import type { SettingsStore } from '../settings';
import type { MasteryState } from './mastery';
import { conceptStatus } from './scheduler';
import { activeMisconceptions, allStates } from './studentModel';

const DAY = 86_400_000;

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** Day keys for `n` days ending today (oldest first). */
export function lastDays(n: number, now: number): string[] {
  const out: string[] = [];
  const d = new Date(startOfDay(now));
  d.setDate(d.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    out.push(dayKey(d.getTime()));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Current streak (ending today, or yesterday if today has no activity yet) and longest streak. */
export function streaks(activeDays: Set<string>, now: number): { streak: number; longest: number } {
  const sorted = [...activeDays].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    const expected = prev ? dayKey(new Date(`${prev}T12:00:00`).getTime() + DAY) : null;
    run = prev && day === expected ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  let streak = 0;
  const d = new Date(startOfDay(now));
  if (!activeDays.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  while (activeDays.has(dayKey(d.getTime()))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return { streak, longest };
}

/** Daily average mastery (0..1) across concepts assessed so far, replayed from mastery_history. */
function trend(db: DB, now: number, days = 90): DashboardDTO['trend'] {
  const rows = db.prepare('SELECT concept_id, mastery, at FROM mastery_history ORDER BY at, id').all() as { concept_id: string; mastery: number; at: number }[];
  if (!rows.length) return [];
  const keys = lastDays(days, now);
  const first = dayKey(rows[0]!.at);
  const latest = new Map<string, number>();
  const out: DashboardDTO['trend'] = [];
  let i = 0;
  for (const key of keys) {
    while (i < rows.length && dayKey(rows[i]!.at) <= key) {
      latest.set(rows[i]!.concept_id, rows[i]!.mastery);
      i++;
    }
    if (key < first || !latest.size) continue;
    out.push({ day: key, overall: [...latest.values()].reduce((s, m) => s + m, 0) / latest.size / 7 });
  }
  return out;
}

function recommendation(
  states: Map<string, MasteryState>,
  now: number,
  preferred: SessionMode,
  stats: { dueNow: number; activeMisc: number; assessed: number; today: number; dailyGoal: number },
  weakest: DashboardDTO['weakest'],
  due: string[],
): DashboardDTO['recommendation'] {
  if (stats.assessed === 0)
    return { mode: 'quick', title: 'Calibrate your starting point', reason: 'A short session on foundations so the coach can see where you are.', concepts: [] };
  if (stats.dueNow >= 5)
    return { mode: 'review', title: `Clear ${stats.dueNow} due reviews`, reason: 'Retrieval just as you start to forget is what makes knowledge stick.', concepts: due.slice(0, 3) };
  if (stats.activeMisc >= 3 || weakest.some((w) => (states.get(w.conceptId)?.failStreak ?? 0) >= 2))
    return { mode: 'weakness', title: 'Hunt down your weak spots', reason: `${stats.activeMisc} active misconception${stats.activeMisc === 1 ? '' : 's'} and repeated misses are worth fixing now.`, concepts: weakest.slice(0, 3).map((w) => w.name) };
  const strong = [...states.values()].filter((s) => s.mastery >= 4 && s.confidence >= 0.5).length;
  if (strong >= 8 && stats.today >= stats.dailyGoal)
    return { mode: 'challenge', title: 'Stretch yourself', reason: 'Daily goal met and a solid base: try harder cross-domain reasoning.', concepts: [] };
  if (stats.dueNow > 0)
    return { mode: preferred === 'review' ? 'standard' : preferred, title: 'Mixed practice with due reviews', reason: `${stats.dueNow} concept${stats.dueNow === 1 ? ' is' : 's are'} due; the session mixes them with new material.`, concepts: due.slice(0, 3) };
  return { mode: preferred, title: 'Keep the momentum', reason: stats.today < stats.dailyGoal ? `${stats.dailyGoal - stats.today} questions to today's goal.` : 'Interleaved practice across weak, new and review material.', concepts: weakest.slice(0, 2).map((w) => w.name) };
}

/** Minimum rated answers before a calibration bias is reported. */
export const MIN_CALIBRATION = 5;

/** Stated confidence vs. actual graded score (Make It Stick, ch. 5: calibrate against objective feedback). */
export function calibration(db: DB, now: number, days = 90): CalibrationDTO {
  const rows = db
    .prepare('SELECT a.id, a.concept_id, a.predicted, a.score, a.result, a.created_at FROM attempts a WHERE a.pending = 0 AND a.predicted IS NOT NULL AND a.score IS NOT NULL AND a.created_at >= ? ORDER BY a.created_at DESC')
    .all(now - days * DAY) as { id: string; concept_id: string; predicted: number; score: number; result: Result; created_at: number }[];
  const levels = CONFIDENCE_LEVELS.map((l) => {
    const xs = rows.filter((r) => r.predicted === l.value);
    return { level: l.value, label: l.label, expected: l.expected, answers: xs.length, score: xs.length ? xs.reduce((sum, r) => sum + r.score, 0) / xs.length : null };
  });
  const expected = (p: number) => CONFIDENCE_LEVELS.find((l) => l.value === p)?.expected ?? 0.5;
  const bias = rows.length >= MIN_CALIBRATION ? rows.reduce((sum, r) => sum + (expected(r.predicted) - r.score), 0) / rows.length : null;
  const confidentErrors = rows
    .filter((r) => r.predicted >= 3 && r.result === 'incorrect')
    .slice(0, 8)
    .map((r) => ({ attemptId: r.id, conceptId: r.concept_id, conceptName: CONCEPT_BY_ID[r.concept_id]?.name ?? r.concept_id, predicted: r.predicted, at: r.created_at }));
  return { levels, rated: rows.length, bias, confidentErrors };
}

/** Delayed retrieval (≥ 1 day after the previous attempt on the concept) vs. first attempts, last 90 days. */
export function retention(db: DB, now: number, days = 90): DashboardDTO['retention'] {
  const rows = db
    .prepare('SELECT concept_id, score, created_at FROM attempts WHERE pending = 0 AND is_follow_up = 0 AND score IS NOT NULL ORDER BY created_at')
    .all() as { concept_id: string; score: number; created_at: number }[];
  const last = new Map<string, number>();
  const delayed: number[] = [];
  const first: number[] = [];
  const since = now - days * DAY;
  for (const r of rows) {
    const prev = last.get(r.concept_id);
    if (r.created_at >= since) {
      if (prev == null) first.push(r.score);
      else if (r.created_at - prev >= DAY) delayed.push(r.score);
    }
    last.set(r.concept_id, r.created_at);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return { delayed: { answers: delayed.length, score: mean(delayed) }, firstTime: { answers: first.length, score: mean(first) } };
}

export function buildDashboard(db: DB, settings: SettingsStore, now = Date.now()): DashboardDTO {
  const s = settings.get();
  const states = allStates(db);
  const assessed = [...states].filter(([, st]) => st.attempts > 0);

  // Activity
  const actRows = db.prepare('SELECT day, questions, correct FROM daily_activity').all() as { day: string; questions: number; correct: number }[];
  const act = new Map(actRows.map((r) => [r.day, r]));
  const activity = lastDays(182, now).map((day) => ({ day, questions: act.get(day)?.questions ?? 0, correct: act.get(day)?.correct ?? 0 }));
  const { streak, longest } = streaks(new Set(actRows.filter((r) => r.questions > 0).map((r) => r.day)), now);
  const today = activity.at(-1)!.questions;
  const week = activity.slice(-7).reduce((sum, d) => sum + d.questions, 0);

  // Reviews
  const dueIds = assessed.filter(([, st]) => st.nextReview != null && st.nextReview <= now).sort((a, b) => a[1].nextReview! - b[1].nextReview!).map(([id]) => id);
  const fkeys = lastDays(14, now + 13 * DAY);
  const forecast = fkeys.map((day) => ({ day, count: 0 }));
  for (const [, st] of assessed) {
    if (st.nextReview == null || st.nextReview <= now) continue;
    const i = fkeys.indexOf(dayKey(st.nextReview));
    if (i >= 0) forecast[i]!.count++;
  }

  const areas = AREAS.map((a) => {
    const all = CONCEPTS.filter((c) => c.area === a.id);
    const xs = all.map((c) => states.get(c.id)).filter((x): x is MasteryState => !!x && x.attempts > 0);
    const avg = (f: (x: MasteryState) => number) => (xs.length ? xs.reduce((sum, x) => sum + f(x), 0) / xs.length : 0);
    return { id: a.id, name: a.name, mastery: avg((x) => x.mastery / 7), confidence: avg((x) => x.confidence), assessed: xs.length, total: all.length };
  });

  const info = (id: string) => ({ conceptId: id, name: CONCEPT_BY_ID[id]!.name, domainName: CONCEPT_BY_ID[id]!.domainName });
  const weakest = assessed
    .sort((a, b) => a[1].mastery - b[1].mastery || a[1].confidence - b[1].confidence)
    .slice(0, 6)
    .map(([id, st]) => ({ ...info(id), mastery: st.mastery / 7, confidence: st.confidence }));

  // Improving: current mastery vs. mastery before the first attempt in the last 14 days.
  const since = now - 14 * DAY;
  const firstBefore = db
    .prepare('SELECT concept_id, mastery_before FROM attempts WHERE created_at >= ? AND mastery_before IS NOT NULL ORDER BY created_at DESC')
    .all(since) as { concept_id: string; mastery_before: number }[];
  const base = new Map<string, number>();
  for (const r of firstBefore) base.set(r.concept_id, r.mastery_before); // DESC order: last write = earliest
  const improving = [...base]
    .map(([id, b]) => ({ id, delta: ((states.get(id)?.mastery ?? b) - b) / 7 }))
    .filter((x) => x.delta > 0.001 && CONCEPT_BY_ID[x.id])
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 6)
    .map((x) => ({ ...info(x.id), mastery: (states.get(x.id)?.mastery ?? 0) / 7, delta: x.delta }));

  const atRisk = assessed
    .filter(([, st]) => conceptStatus(st, now) === 'at-risk')
    .sort((a, b) => a[1].nextReview! - b[1].nextReview!)
    .slice(0, 6)
    .map(([id, st]) => ({ ...info(id), mastery: st.mastery / 7, overdueDays: Math.max(0, Math.round((now - st.nextReview!) / DAY)) }));

  const misc = activeMisconceptions(db);
  const misconceptions = [...misc]
    .sort((a, b) => b.occurrences - a.occurrences || b.last_seen - a.last_seen)
    .slice(0, 8)
    .map((m) => ({ id: m.id, conceptId: m.concept_id, conceptName: CONCEPT_BY_ID[m.concept_id]?.name ?? m.concept_id, text: m.text, occurrences: m.occurrences, lastSeen: m.last_seen }));

  const recentRows = db
    .prepare('SELECT a.id, a.concept_id, a.result, a.created_at, q.type, q.difficulty FROM attempts a JOIN questions q ON q.id = a.question_id WHERE a.pending = 0 AND a.result IS NOT NULL ORDER BY a.created_at DESC LIMIT 10')
    .all() as { id: string; concept_id: string; result: Result; created_at: number; type: QuestionType; difficulty: number }[];
  const recent = recentRows.map((r) => ({ attemptId: r.id, conceptName: CONCEPT_BY_ID[r.concept_id]?.name ?? r.concept_id, type: r.type, difficulty: r.difficulty, result: r.result, at: r.created_at }));

  const stats = {
    streak,
    longestStreak: longest,
    today,
    dailyGoal: s.dailyGoal,
    week,
    weeklyGoal: s.weeklyGoal,
    dueNow: dueIds.length,
    activeMisconceptions: misc.length,
    conceptsAssessed: assessed.length,
    totalConcepts: CONCEPTS.length,
  };

  return {
    generatedAt: now,
    stats,
    areas,
    trend: trend(db, now),
    activity,
    forecast,
    overdue: assessed.filter(([, st]) => st.nextReview != null && st.nextReview < startOfDay(now)).length,
    weakest,
    improving,
    atRisk,
    misconceptions,
    recent,
    calibration: calibration(db, now),
    retention: retention(db, now),
    recommendation: recommendation(
      states,
      now,
      s.preferredMode,
      { dueNow: dueIds.length, activeMisc: misc.length, assessed: assessed.length, today, dailyGoal: s.dailyGoal },
      weakest,
      dueIds.map((id) => CONCEPT_BY_ID[id]!.name),
    ),
  };
}

