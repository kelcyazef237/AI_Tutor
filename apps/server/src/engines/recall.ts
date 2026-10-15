import { nanoid } from 'nanoid';
import { CONCEPT_BY_ID, DOMAIN_BY_ID, RECALL_MINUTES, type RecallDTO, type RecallLevel, type SubmitRecallResponse } from '@psc/shared';
import { AIError } from '../ai/provider';
import type { AppContext } from '../context';
import { parseJson } from '../db';
import { HttpError } from '../errors';
import { applyEvidence, masteryBand } from './mastery';
import { schedule } from './scheduler';
import { allStates, bumpActivity, getState, recordMisconceptions, saveState } from './studentModel';

/**
 * Free recall ("brain dump", Make It Stick ch. 8): write everything you remember about a domain on a
 * blank page, then compare. What you produced counts as (modest) evidence; studied concepts you
 * did not produce are pulled forward for review; wrong statements become misconceptions.
 */

interface RecallRow {
  id: string;
  domain_id: string;
  started_at: number;
  submitted_at: number | null;
  text: string;
  result_json: string | null;
  self_checked: number;
}

type Result = NonNullable<RecallDTO['result']>;

/** Evidence weight per recall level (free recall is real retrieval, but coarse). */
const EVIDENCE: Record<Exclude<RecallLevel, 'none'>, { score: number; result: 'correct' | 'partial' }> = {
  solid: { score: 0.85, result: 'correct' },
  partial: { score: 0.5, result: 'partial' },
};

export class RecallEngine {
  constructor(
    private ctx: AppContext,
    private clock: () => number = Date.now,
  ) {}

  private get db() {
    return this.ctx.db();
  }

  private row(id: string): RecallRow {
    const r = this.db.prepare('SELECT * FROM recalls WHERE id = ?').get(id) as RecallRow | undefined;
    if (!r) throw new HttpError(404, 'Recall not found.');
    return r;
  }

  private dto(r: RecallRow): RecallDTO {
    const result = parseJson<Result | null>(r.result_json, null);
    return {
      id: r.id,
      domainId: r.domain_id,
      domainName: DOMAIN_BY_ID[r.domain_id]?.name ?? r.domain_id,
      startedAt: r.started_at,
      submittedAt: r.submitted_at,
      minutes: RECALL_MINUTES,
      status: result ? 'reviewed' : 'writing',
      text: r.text,
      selfChecked: !!r.self_checked,
      result,
    };
  }

  list(): RecallDTO[] {
    return (this.db.prepare('SELECT * FROM recalls ORDER BY started_at DESC').all() as RecallRow[]).map((r) => this.dto(r));
  }

  get(id: string) {
    return this.dto(this.row(id));
  }

  start(domainId: string): RecallDTO {
    if (!DOMAIN_BY_ID[domainId]) throw new HttpError(400, `Unknown domain: ${domainId}`);
    const id = nanoid(12);
    this.db.prepare('INSERT INTO recalls (id, domain_id, started_at) VALUES (?, ?, ?)').run(id, domainId, this.clock());
    return this.get(id);
  }

  async submit(id: string, text: string): Promise<SubmitRecallResponse> {
    const r = this.row(id);
    if (r.result_json) throw new HttpError(409, 'This recall has already been reviewed.');
    const now = this.clock();
    this.db.prepare('UPDATE recalls SET text = ?, submitted_at = COALESCE(submitted_at, ?) WHERE id = ?').run(text, now, id);
    const domain = DOMAIN_BY_ID[r.domain_id]!;

    if (!text.trim()) {
      // Nothing written: nothing to grade, but everything studied before is due again.
      this.finish(id, domain.concepts.map((c) => ({ conceptId: c.id, recalled: 'none' as const, note: '' })), [], [], 'Nothing was written, so every concept you have studied in this domain is back in your review queue.', false);
      return { kind: 'reviewed', recall: this.get(id) };
    }

    try {
      const review = await this.ctx.ai().recallReview({
        domainName: domain.name,
        concepts: domain.concepts.map((c) => ({ id: c.id, name: c.name })),
        text,
        student: this.profile(r.domain_id),
      });
      const byId = new Map(review.concepts.filter((c) => CONCEPT_BY_ID[c.concept]).map((c) => [c.concept, c]));
      this.finish(
        id,
        domain.concepts.map((c) => ({ conceptId: c.id, recalled: byId.get(c.id)?.recalled ?? 'none', note: byId.get(c.id)?.note ?? '' })),
        review.errors.filter((e) => CONCEPT_BY_ID[e.concept]).map((e) => ({ conceptId: e.concept, text: e.text })),
        review.connections,
        review.feedback,
        false,
      );
      return { kind: 'reviewed', recall: this.get(id) };
    } catch (e) {
      if (!(e instanceof AIError)) throw e;
      return { kind: 'needs_self_check', reason: e.message, recall: this.get(id) };
    }
  }

  /** Offline path: the learner ticks which concepts they actually produced. Weaker evidence. */
  selfCheck(id: string, items: { conceptId: string; recalled: RecallLevel }[]): RecallDTO {
    const r = this.row(id);
    if (r.result_json) throw new HttpError(409, 'This recall has already been reviewed.');
    if (!r.submitted_at) throw new HttpError(409, 'Submit your recall text first.');
    const given = new Map(items.map((i) => [i.conceptId, i.recalled]));
    const domain = DOMAIN_BY_ID[r.domain_id]!;
    this.finish(
      id,
      domain.concepts.map((c) => ({ conceptId: c.id, recalled: given.get(c.id) ?? 'none', note: '' })),
      [],
      [],
      'Self-checked against the concept list while the AI was unavailable. This counts as weaker evidence.',
      true,
    );
    return this.get(id);
  }

  private profile(domainId: string): string {
    const states = [...allStates(this.db)].filter(([id, s]) => s.attempts > 0 && CONCEPT_BY_ID[id]?.domainId === domainId);
    if (!states.length) return 'No prior assessment in this domain.';
    return states.map(([id, s]) => `${CONCEPT_BY_ID[id]!.name}: ${masteryBand(s.mastery)}`).join('; ');
  }

  private finish(
    id: string,
    concepts: { conceptId: string; recalled: RecallLevel; note: string }[],
    errors: { conceptId: string; text: string }[],
    connections: string[],
    feedback: string,
    selfChecked: boolean,
  ) {
    const r = this.row(id);
    const now = this.clock();
    this.db.transaction(() => {
      const out: Result['concepts'] = [];
      for (const c of concepts) {
        const before = getState(this.db, c.conceptId);
        let scheduled = false;
        if (c.recalled !== 'none') {
          const ev = EVIDENCE[c.recalled];
          const applied = applyEvidence(before, { score: ev.score, result: ev.result, difficulty: 2, type: 'explain', selfGraded: selfChecked, now });
          saveState(this.db, c.conceptId, { ...applied.state, ...schedule(before, applied.outcome, now) }, now);
        } else if (before.attempts > 0 && (before.nextReview == null || before.nextReview > now)) {
          // Studied before but not retrievable now: bring it forward without touching mastery.
          saveState(this.db, c.conceptId, { ...before, nextReview: now }, now);
          scheduled = true;
        }
        out.push({ conceptId: c.conceptId, conceptName: CONCEPT_BY_ID[c.conceptId]?.name ?? c.conceptId, recalled: c.recalled, note: c.note, scheduled });
      }
      for (const e of errors) recordMisconceptions(this.db, e.conceptId, [e.text], now);
      const result: Result = {
        concepts: out,
        errors: errors.map((e) => ({ ...e, conceptName: CONCEPT_BY_ID[e.conceptId]?.name ?? e.conceptId })),
        connections,
        feedback,
      };
      this.db.prepare('UPDATE recalls SET result_json = ?, self_checked = ? WHERE id = ?').run(JSON.stringify(result), selfChecked ? 1 : 0, id);
      bumpActivity(this.db, now, { sessions: 1, minutes: Math.min(60, ((r.submitted_at ?? now) - r.started_at) / 60_000) });
    })();
  }
}
