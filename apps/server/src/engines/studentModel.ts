import { nanoid } from 'nanoid';
import { CONCEPT_BY_ID, CONCEPTS, type ConceptStateDTO } from '@psc/shared';
import { dayKey, parseJson, type DB } from '../db';
import { emptyState, type MasteryState } from './mastery';
import { conceptStatus } from './scheduler';

/** DB access for the student model. The DB is the source of truth; the AI only proposes. */

interface StateRow {
  concept_id: string;
  mastery: number;
  confidence: number;
  attempts: number;
  success_streak: number;
  fail_streak: number;
  max_diff_passed: number;
  types_seen: string;
  last_assessed: number | null;
  next_review: number | null;
  interval_hours: number;
  ease: number;
  theory: number;
  practical: number;
  pentest: number;
  obs_hyp: number;
  attack_path: number;
}

const fromRow = (r: StateRow): MasteryState => ({
  mastery: r.mastery,
  confidence: r.confidence,
  attempts: r.attempts,
  successStreak: r.success_streak,
  failStreak: r.fail_streak,
  maxDiffPassed: r.max_diff_passed,
  typesSeen: parseJson<string[]>(r.types_seen, []),
  lastAssessed: r.last_assessed,
  nextReview: r.next_review,
  intervalHours: r.interval_hours,
  ease: r.ease,
  dims: { theory: r.theory, practical: r.practical, pentest: r.pentest, obsHyp: r.obs_hyp, attackPath: r.attack_path },
});

export function getState(db: DB, conceptId: string): MasteryState {
  const r = db.prepare('SELECT * FROM concept_state WHERE concept_id = ?').get(conceptId) as StateRow | undefined;
  return r ? fromRow(r) : emptyState();
}

/** All stored states (concepts never assessed are absent). */
export function allStates(db: DB): Map<string, MasteryState> {
  const rows = db.prepare('SELECT * FROM concept_state').all() as StateRow[];
  return new Map(rows.filter((r) => CONCEPT_BY_ID[r.concept_id]).map((r) => [r.concept_id, fromRow(r)]));
}

export function saveState(db: DB, conceptId: string, s: MasteryState, now: number) {
  db.prepare(
    `INSERT INTO concept_state (concept_id, mastery, confidence, attempts, success_streak, fail_streak, max_diff_passed, types_seen,
       last_assessed, next_review, interval_hours, ease, theory, practical, pentest, obs_hyp, attack_path, updated_at)
     VALUES (@id, @mastery, @confidence, @attempts, @successStreak, @failStreak, @maxDiffPassed, @typesSeen,
       @lastAssessed, @nextReview, @intervalHours, @ease, @theory, @practical, @pentest, @obsHyp, @attackPath, @now)
     ON CONFLICT(concept_id) DO UPDATE SET mastery = excluded.mastery, confidence = excluded.confidence, attempts = excluded.attempts,
       success_streak = excluded.success_streak, fail_streak = excluded.fail_streak, max_diff_passed = excluded.max_diff_passed,
       types_seen = excluded.types_seen, last_assessed = excluded.last_assessed, next_review = excluded.next_review,
       interval_hours = excluded.interval_hours, ease = excluded.ease, theory = excluded.theory, practical = excluded.practical,
       pentest = excluded.pentest, obs_hyp = excluded.obs_hyp, attack_path = excluded.attack_path, updated_at = excluded.updated_at`,
  ).run({
    id: conceptId,
    mastery: s.mastery,
    confidence: s.confidence,
    attempts: s.attempts,
    successStreak: s.successStreak,
    failStreak: s.failStreak,
    maxDiffPassed: s.maxDiffPassed,
    typesSeen: JSON.stringify(s.typesSeen),
    lastAssessed: s.lastAssessed,
    nextReview: s.nextReview,
    intervalHours: s.intervalHours,
    ease: s.ease,
    ...s.dims,
    now,
  });
  db.prepare('INSERT INTO mastery_history (concept_id, mastery, confidence, at) VALUES (?, ?, ?, ?)').run(conceptId, s.mastery, s.confidence, now);
}

export function toConceptDTO(conceptId: string, s: MasteryState, now: number): ConceptStateDTO {
  const c = CONCEPT_BY_ID[conceptId]!;
  return {
    conceptId,
    name: c.name,
    domainId: c.domainId,
    domainName: c.domainName,
    area: c.area,
    mastery: s.mastery,
    confidence: s.confidence,
    attempts: s.attempts,
    successStreak: s.successStreak,
    failStreak: s.failStreak,
    maxDifficultyPassed: s.maxDiffPassed,
    lastAssessed: s.lastAssessed,
    nextReview: s.nextReview,
    intervalHours: s.intervalHours,
    dims: s.dims,
    status: conceptStatus(s, now),
  };
}

/** Every taxonomy concept, assessed or not, in taxonomy order. */
export function conceptStates(db: DB, now = Date.now()): ConceptStateDTO[] {
  const states = allStates(db);
  return CONCEPTS.map((c) => toConceptDTO(c.id, states.get(c.id) ?? emptyState(), now));
}

/* ── Misconceptions ─────────────────────────────────────────── */

export interface MisconceptionRow {
  id: string;
  concept_id: string;
  text: string;
  occurrences: number;
  first_seen: number;
  last_seen: number;
  status: 'active' | 'resolved';
}

const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Records misconceptions seen in an answer; repeats of the same idea increment its count. */
export function recordMisconceptions(db: DB, conceptId: string, texts: string[], now: number) {
  const existing = db.prepare('SELECT * FROM misconceptions WHERE concept_id = ?').all(conceptId) as MisconceptionRow[];
  for (const raw of texts) {
    const text = raw.trim().slice(0, 400);
    if (!text) continue;
    const match = existing.find((m) => normalize(m.text) === normalize(text));
    if (match) {
      db.prepare("UPDATE misconceptions SET occurrences = occurrences + 1, last_seen = ?, status = 'active', resolved_at = NULL WHERE id = ?").run(now, match.id);
    } else {
      const id = nanoid(10);
      db.prepare('INSERT INTO misconceptions (id, concept_id, text, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)').run(id, conceptId, text, now, now);
      existing.push({ id, concept_id: conceptId, text, occurrences: 1, first_seen: now, last_seen: now, status: 'active' });
    }
  }
}

export function resolveMisconceptions(db: DB, conceptId: string, now: number) {
  db.prepare("UPDATE misconceptions SET status = 'resolved', resolved_at = ? WHERE concept_id = ? AND status = 'active'").run(now, conceptId);
}

export function activeMisconceptions(db: DB, conceptId?: string): MisconceptionRow[] {
  return (
    conceptId
      ? db.prepare("SELECT * FROM misconceptions WHERE status = 'active' AND concept_id = ? ORDER BY last_seen DESC").all(conceptId)
      : db.prepare("SELECT * FROM misconceptions WHERE status = 'active' ORDER BY last_seen DESC").all()
  ) as MisconceptionRow[];
}

/* ── Daily activity ─────────────────────────────────────────── */

export function bumpActivity(db: DB, at: number, delta: { questions?: number; correct?: number; minutes?: number; sessions?: number }) {
  db.prepare(
    `INSERT INTO daily_activity (day, questions, correct, minutes, sessions) VALUES (@day, @questions, @correct, @minutes, @sessions)
     ON CONFLICT(day) DO UPDATE SET questions = questions + excluded.questions, correct = correct + excluded.correct,
       minutes = minutes + excluded.minutes, sessions = sessions + excluded.sessions`,
  ).run({ day: dayKey(at), questions: delta.questions ?? 0, correct: delta.correct ?? 0, minutes: delta.minutes ?? 0, sessions: delta.sessions ?? 0 });
}

/* ── Knowledge snippets (FTS5; empty until snippets are added) ── */

export function searchKnowledge(db: DB, conceptId: string, limit = 3): { title: string; content: string; sourceUrl: string | null }[] {
  const direct = db.prepare('SELECT title, content, source_url AS sourceUrl FROM knowledge WHERE concept_id = ? LIMIT ?').all(conceptId, limit) as {
    title: string;
    content: string;
    sourceUrl: string | null;
  }[];
  if (direct.length >= limit) return direct;
  const terms = (CONCEPT_BY_ID[conceptId]?.name ?? '').match(/[A-Za-z0-9]{3,}/g) ?? [];
  if (!terms.length) return direct;
  const q = terms.map((t) => `"${t}"`).join(' OR ');
  try {
    const more = db
      .prepare(
        `SELECT k.title, k.content, k.source_url AS sourceUrl FROM knowledge_fts f JOIN knowledge k ON k.rowid = f.rowid
         WHERE knowledge_fts MATCH ? AND (k.concept_id IS NULL OR k.concept_id != ?) ORDER BY rank LIMIT ?`,
      )
      .all(q, conceptId, limit - direct.length) as typeof direct;
    return [...direct, ...more];
  } catch {
    return direct;
  }
}
