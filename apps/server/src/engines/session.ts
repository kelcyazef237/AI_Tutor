import { nanoid } from 'nanoid';
import {
  CONCEPT_BY_ID,
  DOMAIN_BY_ID,
  MODES,
  conceptName,
  type AnswerRequest,
  type AnswerResponse,
  type AttemptDTO,
  type Evaluation,
  type EvaluationDTO,
  type PublicQuestion,
  type QuestionDef,
  type QuestionSource,
  type Result,
  type SessionDTO,
  type SessionReflection,
  type SessionEndDTO,
  type SessionMode,
  type SessionSummaryDTO,
  type StartSessionRequest,
} from '@psc/shared';
import type { StudentContext } from '../ai/operations';
import { AIError } from '../ai/provider';
import type { AppContext } from '../context';
import { parseJson } from '../db';
import { HttpError } from '../errors';
import { applyEvidence, masteryBand, overallScore } from './mastery';
import { schedule } from './scheduler';
import { planSession, preferredType, type Slot } from './selector';
import {
  activeMisconceptions,
  allStates,
  bumpActivity,
  getState,
  recordMisconceptions,
  resolveMisconceptions,
  saveState,
  searchKnowledge,
} from './studentModel';

/** At most this many follow-ups per main question (Readme: explain → correct → follow-up → re-evaluate). */
export const MAX_FOLLOW_UPS = 2;

interface PlanSlot extends Slot {
  questionId?: string;
}
interface Plan {
  slots: PlanSlot[];
  domains: string[];
}

interface SessionRow {
  id: string;
  mode: SessionMode;
  started_at: number;
  ended_at: number | null;
  total: number;
  answered: number;
  plan_json: string;
  greeting: string;
  current_question_id: string | null;
  followup_depth: number;
  summary_json: string | null;
  reflection_json: string | null;
}

interface QuestionRow {
  id: string;
  concept_id: string;
  type: string;
  difficulty: number;
  source: QuestionSource;
  json: string;
  times_asked: number;
  last_asked: number | null;
}

interface AttemptRow {
  id: string;
  session_id: string | null;
  question_id: string;
  concept_id: string;
  answer: string;
  eval_json: string | null;
  result: Result | null;
  score: number | null;
  mastery_before: number | null;
  mastery_after: number | null;
  self_graded: number;
  is_follow_up: number;
  pending: number;
  duration_ms: number | null;
  created_at: number;
  predicted: number | null;
}

/** Extra fields stored alongside a follow-up question. */
interface FollowUpDef extends QuestionDef {
  parentAttemptId?: string;
}

const DAY = 86_400_000;
const REUSE_AFTER_MS = 7 * DAY;

const resultFromScore = (score: number): Result => (score >= 0.75 ? 'correct' : score >= 0.35 ? 'partial' : 'incorrect');

export class SessionEngine {
  /** Attempts currently being evaluated (guards double submits). */
  private inflight = new Set<string>();

  constructor(
    private ctx: AppContext,
    private rng: () => number = Math.random,
    private clock: () => number = Date.now,
  ) {}

  private get db() {
    return this.ctx.db();
  }

  /* ── Lookups ──────────────────────────────────────────────── */

  private row(id: string): SessionRow {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
    if (!r) throw new HttpError(404, 'Session not found.');
    return r;
  }

  private question(id: string): QuestionRow {
    const q = this.db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as QuestionRow | undefined;
    if (!q) throw new HttpError(404, 'Question not found.');
    return q;
  }

  private def(q: QuestionRow): FollowUpDef {
    return { ...parseJson<FollowUpDef>(q.json, {} as FollowUpDef), id: q.id };
  }

  private attemptFor(sessionId: string, questionId: string) {
    return this.db.prepare('SELECT * FROM attempts WHERE session_id = ? AND question_id = ? ORDER BY created_at DESC LIMIT 1').get(sessionId, questionId) as AttemptRow | undefined;
  }

  private plan(s: SessionRow): Plan {
    return parseJson<Plan>(s.plan_json, { slots: [], domains: [] });
  }

  private savePlan(id: string, plan: Plan) {
    this.db.prepare('UPDATE sessions SET plan_json = ? WHERE id = ?').run(JSON.stringify(plan), id);
  }

  private toPublic(q: QuestionRow, bucket?: Slot['bucket']): PublicQuestion {
    const d = this.def(q);
    const c = CONCEPT_BY_ID[q.concept_id];
    return {
      id: q.id,
      conceptId: q.concept_id,
      conceptName: c?.name ?? q.concept_id,
      domainName: c?.domainName ?? '',
      secondaryConcepts: d.secondaryConcepts ?? [],
      type: d.type,
      difficulty: d.difficulty,
      prompt: d.prompt,
      artifact: d.artifact,
      objective: d.objective,
      estMinutes: d.estMinutes ?? 3,
      source: q.source === 'imported' || q.source === 'custom' ? 'curated' : 'generated',
      isFollowUp: q.source === 'followup',
      bucket: q.source === 'followup' ? undefined : bucket,
    };
  }

  private dto(s: SessionRow): SessionDTO {
    const plan = this.plan(s);
    let current: PublicQuestion | null = null;
    if (!s.ended_at && s.current_question_id) {
      const q = this.question(s.current_question_id);
      current = this.toPublic(q, plan.slots.find((x) => x.questionId === q.id)?.bucket);
    }
    return {
      id: s.id,
      mode: s.mode,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      total: s.total,
      answered: s.answered,
      greeting: s.greeting,
      current,
      plan: plan.slots.map((x) => ({ bucket: x.bucket, conceptId: x.conceptId, conceptName: conceptName(x.conceptId) })),
      feedbackMode: MODES[s.mode].feedback,
    };
  }

  /* ── Student context for the AI ───────────────────────────── */

  studentContext(conceptId: string): StudentContext {
    const st = getState(this.db, conceptId);
    const recent = this.db
      .prepare(
        `SELECT a.eval_json, a.result, q.json FROM attempts a JOIN questions q ON q.id = a.question_id
         WHERE a.concept_id = ? ORDER BY a.created_at DESC LIMIT 6`,
      )
      .all(conceptId) as { eval_json: string | null; result: Result | null; json: string }[];
    return {
      learnerGoal: this.ctx.settings.get().learningGoal,
      conceptMasteryLabel: masteryBand(st.mastery),
      attempts: st.attempts,
      typesSeen: st.typesSeen,
      activeMisconceptions: activeMisconceptions(this.db, conceptId).map((m) => m.text).slice(0, 5),
      recentMistakes: recent
        .filter((r) => r.result && r.result !== 'correct')
        .flatMap((r) => parseJson<Partial<EvaluationDTO>>(r.eval_json, {}).missingPoints ?? [])
        .slice(0, 4),
      recentPrompts: recent.map((r) => parseJson<Partial<QuestionDef>>(r.json, {}).prompt ?? '').filter(Boolean),
    };
  }

  /* ── Question materialization ─────────────────────────────── */

  /** A stored question for the concept, unseen (or not seen recently) first. */
  private bankQuestion(conceptId: string, difficulty: number, exclude: Set<string>, relaxed: boolean): QuestionRow | null {
    const sources = relaxed ? "('imported', 'custom', 'generated')" : "('imported', 'custom')";
    const rows = this.db
      .prepare(
        `SELECT * FROM questions WHERE concept_id = ? AND source IN ${sources}
         ORDER BY CASE WHEN times_asked = 0 THEN 0 ELSE 1 END, ABS(difficulty - ?), COALESCE(last_asked, 0)`,
      )
      .all(conceptId, difficulty) as QuestionRow[];
    const now = this.clock();
    return (
      rows.find(
        (q) => !exclude.has(q.id) && (relaxed || (Math.abs(q.difficulty - difficulty) <= 1 && (q.times_asked === 0 || now - (q.last_asked ?? 0) > REUSE_AFTER_MS))),
      ) ?? null
    );
  }

  /** When the AI is down and a concept has no stored question, swap to a concept that has one. */
  private bankSwap(plan: Plan, exclude: Set<string>): QuestionRow | null {
    const planned = new Set(plan.slots.map((s) => s.conceptId));
    const rows = this.db
      .prepare("SELECT * FROM questions WHERE source IN ('imported', 'custom', 'generated') ORDER BY times_asked, COALESCE(last_asked, 0)")
      .all() as QuestionRow[];
    const ok = (q: QuestionRow) =>
      !exclude.has(q.id) && CONCEPT_BY_ID[q.concept_id] && !planned.has(q.concept_id) && (!plan.domains.length || plan.domains.includes(CONCEPT_BY_ID[q.concept_id]!.domainId));
    return rows.find(ok) ?? null;
  }

  private async generate(slot: PlanSlot, avoidType?: string): Promise<QuestionRow> {
    const c = CONCEPT_BY_ID[slot.conceptId]!;
    const student = this.studentContext(slot.conceptId);
    const secondary = slot.secondaryId && CONCEPT_BY_ID[slot.secondaryId] ? { id: slot.secondaryId, name: CONCEPT_BY_ID[slot.secondaryId]!.name } : null;
    const g = await this.ctx.ai().generateQuestion({
      conceptId: c.id,
      conceptName: c.name,
      domainName: c.domainName,
      difficulty: slot.difficulty,
      preferredType: preferredType(slot.difficulty, student.typesSeen, slot.bucket, this.rng, avoidType),
      secondary,
      student,
      knowledge: searchKnowledge(this.db, c.id),
    });
    const def: QuestionDef = {
      id: `gen-${nanoid(10)}`,
      conceptId: c.id,
      secondaryConcepts: [...new Set([...(secondary ? [secondary.id] : []), ...g.secondaryConcepts.filter((x) => CONCEPT_BY_ID[x] && x !== c.id)])],
      type: g.type,
      // Trust the generator's difficulty only within one step of what was asked for.
      difficulty: Math.abs(g.difficulty - slot.difficulty) <= 1 ? g.difficulty : slot.difficulty,
      prompt: g.prompt,
      artifact: g.artifact ?? undefined,
      objective: g.objective,
      depth: 2,
      estMinutes: Math.min(30, Math.max(1, Math.round(g.estMinutes) || 3)),
      rubric: g.rubric,
    };
    this.insertQuestion(def, 'generated');
    return this.question(def.id);
  }

  private insertQuestion(def: QuestionDef, source: QuestionSource) {
    this.db
      .prepare('INSERT INTO questions (id, concept_id, type, difficulty, source, json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(def.id, def.conceptId, def.type, def.difficulty, source, JSON.stringify(def), this.clock());
  }

  /** Ensures slot `i` has a concrete question and returns its id. */
  private async materialize(sessionId: string, plan: Plan, i: number): Promise<string> {
    const slot = plan.slots[i]!;
    if (slot.questionId) return slot.questionId;
    const used = new Set(plan.slots.map((s) => s.questionId).filter((x): x is string => !!x));
    const preferGenerated = this.rng() < this.ctx.settings.get().preferGenerated;
    // Interleave question types: don't ask the same kind of question twice in a row.
    const prevId = i > 0 ? plan.slots[i - 1]!.questionId : undefined;
    const prevType = prevId ? (this.db.prepare('SELECT type FROM questions WHERE id = ?').get(prevId) as { type: string } | undefined)?.type : undefined;

    let q = preferGenerated ? null : this.bankQuestion(slot.conceptId, slot.difficulty, used, false);
    if (!q) {
      try {
        q = await this.generate(slot, prevType);
      } catch (e) {
        if (!(e instanceof AIError)) throw e;
        // Offline fallback: any stored question for this concept, else one for another concept.
        q = this.bankQuestion(slot.conceptId, slot.difficulty, used, true) ?? this.bankSwap(plan, used);
        if (!q) throw e;
        slot.conceptId = q.concept_id;
      }
    }
    slot.questionId = q.id;
    this.db.prepare('UPDATE questions SET times_asked = times_asked + 1, last_asked = ? WHERE id = ?').run(this.clock(), q.id);
    this.savePlan(sessionId, plan);
    return q.id;
  }

  /* ── Greeting (continuity, built from the DB) ─────────────── */

  private greeting(mode: SessionMode, slots: Slot[], now: number): string {
    const tail =
      mode === 'exam'
        ? ' Exam rules: no hints, no follow-ups, feedback at the end.'
        : mode === 'challenge'
          ? ' Expect to struggle. That is the point.'
          : '';
    const planned = new Set(slots.map((s) => s.conceptId));
    const anyAttempt = this.db.prepare('SELECT 1 FROM attempts LIMIT 1').get();
    if (!anyAttempt) return `Welcome. This first session calibrates your starting point, so explain your reasoning, not just the answer.${tail}`;

    const ago = (ts: number) => {
      const days = Math.floor((now - ts) / DAY);
      return days <= 0 ? 'Earlier today' : days === 1 ? 'Yesterday' : days < 7 ? `${days} days ago` : days < 14 ? 'Last week' : 'A while back';
    };
    const misc = activeMisconceptions(this.db).find((m) => planned.has(m.concept_id)) ?? activeMisconceptions(this.db)[0];
    if (misc) {
      const text = misc.text.replace(/\s+/g, ' ').replace(/[.]+$/, '');
      return `${ago(misc.last_seen)}, on **${conceptName(misc.concept_id)}**, you showed this misconception: _${text}_. Let's see if that's settled.${tail}`;
    }
    const due = slots.filter((s) => s.bucket === 'review');
    if (due.length) return `${due.length} concept${due.length === 1 ? ' is' : 's are'} due for review, starting with **${conceptName(due[0]!.conceptId)}**.${tail}`;
    const last = this.db.prepare('SELECT * FROM sessions WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT 1').get() as SessionRow | undefined;
    if (last) {
      const res = this.db.prepare("SELECT result, COUNT(*) n FROM attempts WHERE session_id = ? AND pending = 0 AND is_follow_up = 0 GROUP BY result").all(last.id) as { result: Result; n: number }[];
      const correct = res.find((r) => r.result === 'correct')?.n ?? 0;
      const graded = res.reduce((s, r) => s + r.n, 0);
      if (graded) return `${ago(last.started_at)} you got ${correct} of ${graded} fully right. Let's build on that.${tail}`;
    }
    return `Let's pick up where you left off.${tail}`;
  }

  /* ── API operations ───────────────────────────────────────── */

  async start(req: StartSessionRequest): Promise<SessionDTO> {
    const unknown = req.domains.filter((d) => !DOMAIN_BY_ID[d]);
    if (unknown.length) throw new HttpError(400, `Unknown domain: ${unknown.join(', ')}`);
    // No explicit focus -> fall back to the profile's objective (focusDomains), so sessions respect it.
    const domains = req.domains.length ? req.domains : this.ctx.settings.get().focusDomains.filter((d) => DOMAIN_BY_ID[d]);
    const now = this.clock();
    const misconceptions = new Set(activeMisconceptions(this.db).map((m) => m.concept_id));
    const slots = planSession({ mode: req.mode, now, domains, states: allStates(this.db), misconceptions, rng: this.rng });
    if (!slots.length) {
      throw new HttpError(
        400,
        req.mode === 'review' ? 'Nothing to review yet. Answer a few questions first and reviews will be scheduled.' : 'No concepts are available for the selected focus.',
      );
    }
    const id = nanoid(12);
    const plan: Plan = { slots, domains };
    this.db
      .prepare('INSERT INTO sessions (id, mode, started_at, total, plan_json, greeting) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.mode, now, slots.length, JSON.stringify(plan), this.greeting(req.mode, slots, now));
    try {
      const qid = await this.materialize(id, plan, 0);
      this.db.prepare('UPDATE sessions SET current_question_id = ? WHERE id = ?').run(qid, id);
    } catch (e) {
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
      throw e;
    }
    bumpActivity(this.db, now, { sessions: 1 });
    return this.dto(this.row(id));
  }

  /** Resume. If the current question was already answered, moves on to the next one. */
  async get(id: string): Promise<SessionDTO> {
    const s = this.row(id);
    if (!s.ended_at && s.current_question_id && this.attemptFor(id, s.current_question_id)) return this.next(id);
    return this.dto(s);
  }

  async next(id: string): Promise<SessionDTO> {
    const s = this.row(id);
    if (s.ended_at) return this.dto(s);
    // The current question must be answered (or skipped) before moving on.
    if (s.current_question_id && !this.attemptFor(id, s.current_question_id)) return this.dto(s);
    let current: string | null = null;
    if (s.answered < s.total) current = await this.materialize(id, this.plan(s), s.answered);
    this.db.prepare('UPDATE sessions SET current_question_id = ?, followup_depth = 0 WHERE id = ?').run(current, id);
    return this.dto(this.row(id));
  }

  async answer(id: string, body: AnswerRequest): Promise<AnswerResponse> {
    const s = this.row(id);
    if (s.ended_at) throw new HttpError(409, 'This session has ended.');
    if (body.questionId !== s.current_question_id) throw new HttpError(409, 'That is not the current question. Reload the session.');
    const q = this.question(body.questionId);
    const def = this.def(q);
    const isFollowUp = q.source === 'followup';
    const exam = s.mode === 'exam';
    const now = this.clock();
    const predicted = body.skipped ? null : (body.confidence ?? null);

    let attempt = this.attemptFor(id, q.id);
    if (attempt && (!attempt.pending || this.inflight.has(attempt.id))) throw new HttpError(409, 'This question has already been answered.');
    if (attempt) {
      // Retry of an answer whose evaluation never completed.
      this.db.prepare('UPDATE attempts SET answer = ?, duration_ms = ?, predicted = ? WHERE id = ?').run(body.skipped ? '' : body.answer, body.durationMs, predicted, attempt.id);
    } else {
      const aid = nanoid(12);
      this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO attempts (id, session_id, question_id, concept_id, answer, is_follow_up, pending, duration_ms, created_at, predicted)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          )
          .run(aid, id, q.id, q.concept_id, body.skipped ? '' : body.answer, isFollowUp ? 1 : 0, body.durationMs, now, predicted);
        if (!isFollowUp) this.db.prepare('UPDATE sessions SET answered = answered + 1 WHERE id = ?').run(id);
      })();
      attempt = this.attemptFor(id, q.id)!;
    }

    const attemptId = attempt.id;
    this.inflight.add(attemptId);
    try {
      let evaluation: Evaluation;
      if (body.skipped || !body.answer.trim()) {
        evaluation = skippedEvaluation(def);
      } else {
        try {
          evaluation = await this.ctx.ai().evaluate({
            question: def,
            conceptName: conceptName(q.concept_id),
            answer: body.answer,
            isFollowUp,
            parentContext: isFollowUp ? this.parentContext(def) : undefined,
            student: this.studentContext(q.concept_id),
            knowledge: searchKnowledge(this.db, q.concept_id),
            examMode: exam,
          });
        } catch (e) {
          if (!(e instanceof AIError)) throw e;
          const session = this.dto(this.row(id));
          // Exam: keep it pending and retry at the end. Otherwise: let the learner grade against the rubric.
          if (exam) return { kind: 'recorded', attemptId, session };
          return { kind: 'needs_self_grade', attemptId, rubric: def.rubric, reason: e.message, session };
        }
      }

      const graded = this.grade(attemptId, evaluation, false);
      if (exam) return { kind: 'recorded', attemptId, session: this.dto(this.row(id)) };

      const fresh = this.row(id);
      const wantsFollowUp =
        MODES[s.mode].followUps &&
        evaluation.recommended_action === 'follow_up' &&
        !!evaluation.follow_up_question?.trim() &&
        evaluation.result !== 'correct' &&
        fresh.followup_depth < MAX_FOLLOW_UPS;
      if (wantsFollowUp) {
        const fu = this.createFollowUp(def, attemptId, evaluation);
        this.db.prepare('UPDATE sessions SET current_question_id = ?, followup_depth = followup_depth + 1 WHERE id = ?').run(fu.id, id);
        graded.followUp = this.toPublic(this.question(fu.id));
      }
      return { kind: 'evaluated', evaluation: graded, session: this.dto(this.row(id)) };
    } finally {
      this.inflight.delete(attemptId);
    }
  }

  selfGrade(attemptId: string, score: number): EvaluationDTO {
    const a = this.db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId) as AttemptRow | undefined;
    if (!a) throw new HttpError(404, 'Attempt not found.');
    if (!a.pending || this.inflight.has(a.id)) throw new HttpError(409, 'This answer has already been graded.');
    const result = resultFromScore(score);
    const scores = { correctness: score, conceptual_understanding: score, reasoning_quality: score, pentest_application: score, observation_vs_hypothesis: score };
    const evaluation: Evaluation = {
      result,
      scores,
      confidence: 0.4,
      guessed: false,
      understands_mechanism: score >= 0.75,
      misconceptions: [],
      concepts_demonstrated: [],
      concepts_to_review: result === 'correct' ? [] : [conceptName(a.concept_id)],
      missing_points: [],
      recommended_action: 'advance',
      follow_up_question: null,
      mastery_delta: 0,
      feedback: 'Self-graded against the rubric while the AI evaluator was unavailable. This counts as weaker evidence than an AI-graded answer.',
    };
    return this.grade(a.id, evaluation, true);
  }

  async end(id: string): Promise<SessionEndDTO> {
    let s = this.row(id);
    if (!s.ended_at) {
      if (s.mode === 'exam') await this.gradePendingExam(id);
      this.db.prepare('UPDATE sessions SET ended_at = ?, current_question_id = NULL WHERE id = ?').run(this.clock(), id);
      s = this.row(id);
    }
    const attempts = this.attemptRows(id);
    const graded = attempts.filter((a) => !a.pending);

    const changes = new Map<string, { before: number; after: number }>();
    for (const a of graded) {
      if (a.mastery_before == null || a.mastery_after == null) continue;
      const c = changes.get(a.concept_id);
      if (c) c.after = a.mastery_after;
      else changes.set(a.concept_id, { before: a.mastery_before, after: a.mastery_after });
    }
    const conceptIds = [...new Set(attempts.map((a) => a.concept_id))];
    const newMisc = conceptIds.length
      ? (this.db
          .prepare(`SELECT concept_id, text FROM misconceptions WHERE first_seen >= ? AND first_seen <= ? AND concept_id IN (${conceptIds.map(() => '?').join(',')}) ORDER BY first_seen`)
          .all(s.started_at, s.ended_at ?? this.clock(), ...conceptIds) as { concept_id: string; text: string }[])
      : [];

    const out: SessionEndDTO = {
      summary: this.summarize(s, attempts),
      evaluations: graded
        .filter((a) => a.eval_json)
        .map((a) => {
          const q = this.db.prepare('SELECT json FROM questions WHERE id = ?').get(a.question_id) as { json: string } | undefined;
          return { ...parseJson<EvaluationDTO>(a.eval_json, {} as EvaluationDTO), followUp: null, conceptName: conceptName(a.concept_id), prompt: parseJson<Partial<QuestionDef>>(q?.json, {}).prompt ?? '' };
        }),
      masteryChanges: [...changes].map(([conceptId, c]) => ({ conceptId, conceptName: conceptName(conceptId), before: c.before, after: c.after })),
      newMisconceptions: newMisc.map((m) => ({ conceptName: conceptName(m.concept_id), text: m.text })),
    };
    this.db.prepare('UPDATE sessions SET summary_json = ? WHERE id = ?').run(JSON.stringify(out.summary), id);
    return out;
  }

  /** Saves (or replaces) the end-of-session reflection. Empty reflections clear it. */
  reflect(id: string, r: SessionReflection): SessionSummaryDTO {
    this.row(id);
    const empty = !r.wentWell && !r.change && !r.connects;
    this.db.prepare('UPDATE sessions SET reflection_json = ? WHERE id = ?').run(empty ? null : JSON.stringify(r), id);
    return this.summarize(this.row(id), this.attemptRows(id));
  }

  list(): SessionSummaryDTO[] {
    const rows = this.db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all() as SessionRow[];
    const all = this.db.prepare('SELECT * FROM attempts WHERE session_id IS NOT NULL ORDER BY created_at').all() as AttemptRow[];
    const by = new Map<string, AttemptRow[]>();
    for (const a of all) by.set(a.session_id!, [...(by.get(a.session_id!) ?? []), a]);
    return rows.map((s) => this.summarize(s, by.get(s.id) ?? []));
  }

  attempts(id: string): AttemptDTO[] {
    this.row(id);
    return this.attemptRows(id).map((a) => {
      const q = this.db.prepare('SELECT * FROM questions WHERE id = ?').get(a.question_id) as QuestionRow | undefined;
      const def = q ? this.def(q) : undefined;
      const ev = parseJson<Partial<EvaluationDTO>>(a.eval_json, {});
      return {
        id: a.id,
        conceptId: a.concept_id,
        conceptName: conceptName(a.concept_id),
        type: def?.type ?? 'conceptual',
        difficulty: def?.difficulty ?? 1,
        isFollowUp: !!a.is_follow_up,
        selfGraded: !!a.self_graded,
        result: a.pending ? null : a.result,
        score: a.pending ? null : a.score,
        masteryBefore: a.mastery_before,
        masteryAfter: a.mastery_after,
        createdAt: a.created_at,
        durationMs: a.duration_ms,
        prompt: def?.prompt ?? '',
        answer: a.answer,
        feedback: ev.feedback ?? '',
        predicted: a.predicted,
      };
    });
  }

  /* ── Internals ────────────────────────────────────────────── */

  private attemptRows(sessionId: string) {
    return this.db.prepare('SELECT * FROM attempts WHERE session_id = ? ORDER BY created_at, rowid').all(sessionId) as AttemptRow[];
  }

  private summarize(s: SessionRow, attempts: AttemptRow[]): SessionSummaryDTO {
    const results: Record<Result, number> = { correct: 0, partial: 0, incorrect: 0 };
    const first = new Map<string, number>();
    const last = new Map<string, number>();
    for (const a of attempts) {
      if (a.pending || !a.result) continue;
      results[a.result]++;
      if (a.mastery_before != null && !first.has(a.concept_id)) first.set(a.concept_id, a.mastery_before);
      if (a.mastery_after != null) last.set(a.concept_id, a.mastery_after);
    }
    let change = 0;
    for (const [c, after] of last) change += (after - (first.get(c) ?? after)) / 7;
    return {
      id: s.id,
      mode: s.mode,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      total: s.total,
      answered: s.answered,
      results,
      masteryChange: change,
      concepts: [...new Set(attempts.map((a) => a.concept_id))].slice(0, 3).map(conceptName),
      reflection: parseJson<SessionReflection | null>(s.reflection_json, null),
    };
  }

  private parentContext(def: FollowUpDef): string {
    if (!def.parentAttemptId) return '';
    const a = this.db.prepare('SELECT * FROM attempts WHERE id = ?').get(def.parentAttemptId) as AttemptRow | undefined;
    if (!a) return '';
    const q = this.db.prepare('SELECT json FROM questions WHERE id = ?').get(a.question_id) as { json: string } | undefined;
    const ev = parseJson<Partial<EvaluationDTO>>(a.eval_json, {});
    return [`ORIGINAL QUESTION: ${parseJson<Partial<QuestionDef>>(q?.json, {}).prompt ?? ''}`, `STUDENT'S ORIGINAL ANSWER: ${a.answer}`, `FEEDBACK GIVEN: ${ev.feedback ?? ''}`].join('\n');
  }

  private createFollowUp(parent: FollowUpDef, parentAttemptId: string, ev: Evaluation): FollowUpDef {
    // Chain follow-ups to the original main attempt so the evaluator sees the whole thread.
    const fu: FollowUpDef = {
      id: `fu-${nanoid(10)}`,
      conceptId: parent.conceptId,
      secondaryConcepts: [],
      type: 'explain',
      difficulty: parent.difficulty,
      prompt: ev.follow_up_question!.trim(),
      objective: `Close the gap: ${ev.missing_points[0] ?? parent.objective}`,
      depth: parent.depth ?? 2,
      estMinutes: 2,
      rubric: { keyPoints: ev.missing_points, misconceptions: ev.misconceptions, referenceAnswer: '' },
      parentAttemptId,
    };
    this.insertQuestion(fu, 'followup');
    return fu;
  }

  private async gradePendingExam(sessionId: string) {
    for (const a of this.attemptRows(sessionId).filter((x) => x.pending)) {
      const q = this.question(a.question_id);
      try {
        const ev = await this.ctx.ai().evaluate({
          question: this.def(q),
          conceptName: conceptName(a.concept_id),
          answer: a.answer,
          isFollowUp: false,
          student: this.studentContext(a.concept_id),
          knowledge: searchKnowledge(this.db, a.concept_id),
          examMode: true,
        });
        this.grade(a.id, ev, false);
      } catch (e) {
        if (!(e instanceof AIError)) throw e;
        return; // still unavailable: leave the rest ungraded
      }
    }
  }

  /** Applies an evaluation to the student model and stores it on the attempt. */
  private grade(attemptId: string, ev: Evaluation, selfGraded: boolean): EvaluationDTO {
    const a = this.db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId) as AttemptRow;
    const q = this.question(a.question_id);
    const def = this.def(q);
    const now = this.clock();
    const score = selfGraded ? ev.scores.correctness : overallScore(ev.scores);

    return this.db.transaction(() => {
      const before = getState(this.db, a.concept_id);
      const applied = applyEvidence(before, {
        score,
        result: ev.result,
        difficulty: def.difficulty,
        type: def.type,
        isFollowUp: !!a.is_follow_up,
        selfGraded,
        guessed: ev.guessed,
        predicted: a.predicted,
        aiDelta: selfGraded ? null : ev.mastery_delta,
        scores: ev.scores,
        now,
      });
      const next = { ...applied.state, ...schedule(before, applied.outcome, now) };
      saveState(this.db, a.concept_id, next, now);

      recordMisconceptions(this.db, a.concept_id, ev.misconceptions, now);
      if (applied.outcome === 'success' && !ev.misconceptions.length && next.successStreak >= 2) resolveMisconceptions(this.db, a.concept_id, now);

      const dto: EvaluationDTO = {
        attemptId,
        result: ev.result,
        scores: ev.scores,
        feedback: ev.feedback,
        misconceptions: ev.misconceptions,
        missingPoints: ev.missing_points,
        conceptsDemonstrated: ev.concepts_demonstrated,
        followUp: null,
        masteryBefore: before.mastery,
        masteryAfter: next.mastery,
        confidenceAfter: next.confidence,
        nextReview: next.nextReview,
        rubric: def.rubric,
        selfGraded,
        predicted: a.predicted,
      };
      this.db
        .prepare('UPDATE attempts SET eval_json = ?, result = ?, score = ?, mastery_before = ?, mastery_after = ?, self_graded = ?, pending = 0 WHERE id = ?')
        .run(JSON.stringify(dto), ev.result, score, before.mastery, next.mastery, selfGraded ? 1 : 0, attemptId);
      bumpActivity(this.db, now, {
        questions: a.is_follow_up ? 0 : 1,
        correct: !a.is_follow_up && ev.result === 'correct' ? 1 : 0,
        minutes: (a.duration_ms ?? 0) / 60_000,
      });
      return dto;
    })();
  }
}

function skippedEvaluation(def: QuestionDef): Evaluation {
  const zero = { correctness: 0, conceptual_understanding: 0, reasoning_quality: 0, pentest_application: 0, observation_vs_hypothesis: 0 };
  const ref = def.rubric.referenceAnswer || def.rubric.keyPoints.map((k) => `- ${k}`).join('\n');
  return {
    result: 'incorrect',
    scores: zero,
    confidence: 1,
    guessed: false,
    understands_mechanism: false,
    misconceptions: [],
    concepts_demonstrated: [],
    concepts_to_review: [def.conceptId],
    missing_points: def.rubric.keyPoints,
    recommended_action: 'advance',
    follow_up_question: null,
    mastery_delta: 0,
    feedback: `You skipped this one. Saying "I don't know" is better than guessing, and it tells the coach where to focus.${ref ? `\n\n**What a strong answer covers:**\n\n${ref}` : ''}`,
  };
}
