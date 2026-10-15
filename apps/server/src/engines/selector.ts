import { CONCEPT_BY_ID, CONCEPTS, MODES, QUESTION_TYPES, type Bucket, type QuestionType, type SessionMode } from '@psc/shared';
import type { MasteryState } from './mastery';

/**
 * Question selection. Builds the session plan (one slot per question) from the student model.
 * Pure and deterministic given `rng`, so it can be unit-tested.
 */

export type SelectorState = Pick<MasteryState, 'mastery' | 'confidence' | 'attempts' | 'successStreak' | 'failStreak' | 'nextReview' | 'intervalHours' | 'lastAssessed' | 'typesSeen'>;

export interface Slot {
  bucket: Bucket;
  conceptId: string;
  difficulty: number;
  secondaryId?: string | null;
}

export interface SelectorInput {
  mode: SessionMode;
  now: number;
  /** Domain ids to focus on; empty = all. */
  domains: string[];
  states: Map<string, SelectorState>;
  /** Concepts with active misconceptions. */
  misconceptions: Set<string>;
  count?: number;
  rng?: () => number;
}

type Weights = Partial<Record<Bucket, number>>;

/** Readme distribution: 40 weak / 25 reinforcement / 20 new / 10 cross-domain / 5 challenge. */
export const DEFAULT_WEIGHTS: Weights = { weak: 40, reinforce: 25, new: 20, cross: 10, challenge: 5 };

export const MODE_WEIGHTS: Record<SessionMode, Weights> = {
  quick: DEFAULT_WEIGHTS,
  standard: DEFAULT_WEIGHTS,
  deep: DEFAULT_WEIGHTS,
  exam: { weak: 25, reinforce: 35, new: 25, cross: 15 },
  weakness: { weak: 75, review: 15, cross: 10 },
  review: { review: 100 },
  challenge: { challenge: 60, cross: 40 },
};

/** When a bucket can't be filled, its slots spill into these, in order. */
const SPILL: Record<SessionMode, Bucket[]> = {
  quick: ['new', 'reinforce', 'weak', 'review', 'cross', 'challenge'],
  standard: ['new', 'reinforce', 'weak', 'review', 'cross', 'challenge'],
  deep: ['new', 'reinforce', 'weak', 'review', 'cross', 'challenge'],
  exam: ['new', 'reinforce', 'weak', 'cross', 'challenge'],
  weakness: ['weak', 'review', 'reinforce', 'new'],
  review: ['review', 'weak', 'reinforce'],
  challenge: ['challenge', 'cross', 'reinforce', 'new'],
};

/** Order buckets appear in during a session (exam is shuffled instead). */
const ORDER: Bucket[] = ['prereq', 'review', 'weak', 'new', 'reinforce', 'cross', 'challenge'];

/** A prerequisite counts as satisfied once the learner is at least "familiar" with it. */
export const PREREQ_OK = 1;
/** A concept appears at most this many times in one session. */
export const MAX_PER_CONCEPT = 3;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const levelOf = (m: number) => Math.round(m / 1.4);

/** Largest-remainder split of `count` slots across weighted buckets. */
export function allocate(count: number, weights: Weights): Map<Bucket, number> {
  const entries = Object.entries(weights).filter(([, w]) => w! > 0) as [Bucket, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  const raw = entries.map(([b, w]) => ({ b, exact: (count * w) / total }));
  const out = new Map(raw.map((r) => [r.b, Math.floor(r.exact)]));
  let left = count - [...out.values()].reduce((s, n) => s + n, 0);
  for (const r of [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))) {
    if (left <= 0) break;
    out.set(r.b, out.get(r.b)! + 1);
    left--;
  }
  return out;
}

export function planSession(input: SelectorInput): Slot[] {
  const rng = input.rng ?? Math.random;
  const count = input.count ?? MODES[input.mode].count;
  const { states, now } = input;
  const st = (id: string) => states.get(id);
  const assessed = (id: string) => (st(id)?.attempts ?? 0) > 0;
  const mastery = (id: string) => st(id)?.mastery ?? 0;
  const inFocus = (id: string) => !input.domains.length || input.domains.includes(CONCEPT_BY_ID[id]!.domainId);
  const jitter = new Map(CONCEPTS.map((c) => [c.id, rng()]));

  const isWeak = (id: string) => {
    const s = st(id)!;
    return s.failStreak > 0 || input.misconceptions.has(id) || s.successStreak === 0 || s.mastery < 1.5;
  };
  const prereqOk = (id: string) => assessed(id) && mastery(id) >= PREREQ_OK;

  /** Concept to actually study to make progress on `id`: itself, or its first unmet prerequisite (recursively). */
  const frontier = (id: string, seen = new Set<string>()): string => {
    if (seen.has(id)) return id;
    seen.add(id);
    for (const p of CONCEPT_BY_ID[id]?.prereqs ?? []) if (!prereqOk(p)) return frontier(p, seen);
    return id;
  };
  /** Weak or missing prerequisite of a struggling concept, if any. */
  const weakPrereq = (id: string) => (CONCEPT_BY_ID[id]?.prereqs ?? []).find((p) => !prereqOk(p) || (assessed(p) && st(p)!.failStreak > 0));

  const focusIds = CONCEPTS.map((c) => c.id).filter(inFocus);
  const assessedIds = focusIds.filter(assessed);

  // ── Candidate pools (best first) ──
  const weakScore = (id: string) => {
    const s = st(id)!;
    return s.mastery + 2 * s.confidence - 0.7 * s.failStreak - (input.misconceptions.has(id) ? 1 : 0) + jitter.get(id)! * 0.3;
  };
  const weak = assessedIds.filter(isWeak).sort((a, b) => weakScore(a) - weakScore(b));

  const overdueRatio = (id: string) => {
    const s = st(id)!;
    return (now - s.nextReview!) / Math.max(1, s.intervalHours * 3_600_000);
  };
  const due = assessedIds.filter((id) => st(id)!.nextReview != null && st(id)!.nextReview! <= now).sort((a, b) => overdueRatio(b) - overdueRatio(a));
  // Review mode also takes recently failed and shaky concepts when little is due.
  const review =
    input.mode === 'review'
      ? [...due, ...weak.filter((id) => !due.includes(id)), ...assessedIds.filter((id) => !due.includes(id) && !weak.includes(id)).sort((a, b) => st(a)!.confidence - st(b)!.confidence)]
      : due;

  const reinforce = assessedIds.filter((id) => !isWeak(id)).sort((a, b) => (st(a)!.lastAssessed ?? 0) - (st(b)!.lastAssessed ?? 0) + (jitter.get(a)! - jitter.get(b)!) * 3_600_000);

  // New material: the prerequisite frontier of every unassessed concept in focus.
  const depth = (id: string) => (CONCEPT_BY_ID[id]?.prereqs?.length ?? 0) + jitter.get(id)!;
  const newPool: { id: string; bucket: Bucket }[] = [];
  const seenNew = new Set<string>();
  for (const id of focusIds.filter((x) => !assessed(x)).sort((a, b) => depth(a) - depth(b))) {
    const f = frontier(id);
    if (seenNew.has(f) || (assessed(f) && f !== id && !isWeak(f))) continue;
    seenNew.add(f);
    // A frontier counts as 'prereq' when it is being revisited or lies outside the chosen focus.
    newPool.push({ id: f, bucket: f !== id && (assessed(f) || !inFocus(f)) ? 'prereq' : 'new' });
  }

  const challenge = assessedIds.filter((id) => st(id)!.successStreak > 0).sort((a, b) => mastery(b) - mastery(a) + (jitter.get(a)! - jitter.get(b)!) * 0.5);
  const crossPrimary = [...assessedIds].sort((a, b) => mastery(b) - mastery(a) + (jitter.get(a)! - jitter.get(b)!) * 2);

  // ── Weights adapted to the student model ──
  let weights: Weights = { ...MODE_WEIGHTS[input.mode] };
  if (!assessedIds.length && input.mode !== 'review') weights = { new: 100 }; // cold start: calibrate on foundations
  else if (['quick', 'standard', 'deep'].includes(input.mode) && due.length) {
    // Due reviews take priority over plain reinforcement.
    const r = Math.min(weights.reinforce ?? 0, 10 + due.length * 5);
    weights = { ...weights, review: r, reinforce: (weights.reinforce ?? 0) - r };
  }
  if (input.mode === 'weakness' && !weak.length) weights = { review: 50, reinforce: 30, new: 20 };

  const used = new Set<string>();
  const slots: Slot[] = [];

  const difficultyFor = (bucket: Bucket, id: string) => {
    const lvl = levelOf(mastery(id));
    let d: number;
    switch (bucket) {
      case 'new':
        d = (CONCEPT_BY_ID[id]?.prereqs ?? []).every((p) => mastery(p) >= 4) && CONCEPT_BY_ID[id]?.prereqs?.length ? 2 : 1;
        break;
      case 'prereq':
      case 'weak':
      case 'review':
        d = Math.max(1, lvl);
        break;
      case 'reinforce':
      case 'cross':
        d = lvl + 1;
        break;
      case 'challenge':
        d = lvl + 2;
        break;
    }
    if (input.mode === 'challenge') d = Math.max(4, d);
    if (input.mode === 'exam') d = Math.max(2, d);
    return clamp(d, 1, 5);
  };

  const otherAreaPartner = (id: string) => {
    const area = CONCEPT_BY_ID[id]!.area;
    const pool = CONCEPTS.filter((c) => c.area !== area && !used.has(c.id));
    const known = pool.filter((c) => assessed(c.id) && mastery(c.id) >= PREREQ_OK);
    const candidates = known.length ? known : pool.filter((c) => !c.prereqs?.length);
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)]!.id;
  };

  const take = (bucket: Bucket): Slot | null => {
    const push = (id: string, b: Bucket = bucket): Slot => {
      used.add(id);
      return { bucket: b, conceptId: id, difficulty: difficultyFor(b, id) };
    };
    switch (bucket) {
      case 'weak':
        for (const id of weak) {
          if (used.has(id)) continue;
          // A concept that keeps failing on top of a shaky prerequisite: go back to the prerequisite first.
          const s = st(id)!;
          const p = s.failStreak >= 2 || (s.attempts >= 2 && s.mastery < 1.5) ? weakPrereq(id) : undefined;
          if (p && !used.has(p)) return push(p, 'prereq');
          return push(id);
        }
        return null;
      case 'review':
        for (const id of review) if (!used.has(id)) return push(id);
        return null;
      case 'reinforce':
        for (const id of reinforce) if (!used.has(id)) return push(id);
        return null;
      case 'new':
      case 'prereq':
        for (const c of newPool) if (!used.has(c.id)) return push(c.id, c.bucket);
        return null;
      case 'challenge':
        for (const id of challenge) if (!used.has(id)) return push(id);
        return null;
      case 'cross':
        for (const id of crossPrimary) {
          if (used.has(id)) continue;
          const partner = otherAreaPartner(id);
          if (!partner) continue;
          const slot = push(id);
          return { ...slot, secondaryId: partner };
        }
        return null;
    }
  };

  const alloc = allocate(count, weights);
  const spill: Bucket[] = [];
  for (const bucket of ORDER) {
    for (let i = 0; i < (alloc.get(bucket) ?? 0); i++) {
      const s = take(bucket);
      if (s) slots.push(s);
      else spill.push(bucket);
    }
  }
  // Unfilled slots go to the next best bucket that still has candidates.
  for (let i = 0; i < spill.length && slots.length < count; i++) {
    for (const b of SPILL[input.mode]) {
      const s = take(b);
      if (s) {
        slots.push(s);
        break;
      }
    }
  }

  // Small pools (narrow focus, early on): revisit planned concepts with fresh questions, a step harder each pass.
  const base = [...slots];
  for (let pass = 1; input.mode !== 'review' && pass < MAX_PER_CONCEPT && slots.length < count && base.length; pass++) {
    for (const b of base) {
      if (slots.length >= count) break;
      slots.push({ ...b, difficulty: clamp(b.difficulty + pass, 1, 5) });
    }
  }

  if (input.mode === 'exam') {
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [slots[i], slots[j]] = [slots[j]!, slots[i]!];
    }
  } else {
    slots.sort((a, b) => ORDER.indexOf(a.bucket) - ORDER.indexOf(b.bucket));
    return interleave(slots);
  }
  return slots;
}

const domainOf = (id: string) => CONCEPT_BY_ID[id]?.domainId ?? '';

/**
 * Interleaved order (Make It Stick, ch. 3): consecutive questions switch domain and concept, so each
 * one requires "reloading" what you know instead of riding on the previous answer. Priority order is
 * kept where possible, and a prerequisite always comes before a concept that depends on it.
 */
export function interleave(slots: Slot[]): Slot[] {
  const rest = [...slots];
  const out: Slot[] = [];
  const blocked = (s: Slot) =>
    rest.some((o) => o !== s && (CONCEPT_BY_ID[s.conceptId]?.prereqs ?? []).includes(o.conceptId)) ||
    rest.some((o) => o !== s && o.conceptId === s.conceptId && rest.indexOf(o) < rest.indexOf(s)); // keep repeat passes in order
  while (rest.length) {
    const last = out.at(-1);
    const ok = rest.filter((s) => !blocked(s));
    const pool = ok.length ? ok : rest;
    const pick =
      (last && pool.find((s) => domainOf(s.conceptId) !== domainOf(last.conceptId) && s.bucket !== last.bucket)) ||
      (last && pool.find((s) => domainOf(s.conceptId) !== domainOf(last.conceptId))) ||
      (last && pool.find((s) => s.conceptId !== last.conceptId)) ||
      pool[0]!;
    out.push(pick);
    rest.splice(rest.indexOf(pick), 1);
  }
  return out;
}

const TYPE_BANDS: QuestionType[][] = [
  ['conceptual', 'explain', 'compare'],
  ['scenario', 'command', 'packet', 'troubleshoot', 'tool-selection', 'vuln-id', 'code-review'],
  ['attack-path', 'failing-assumption', 'why-vuln', 'decision', 'investigate-next'],
];

/** Question type to ask the generator for: matched to difficulty, preferring types not yet seen (transfer). */
export function preferredType(difficulty: number, typesSeen: string[], bucket: Bucket, rng: () => number = Math.random, avoid?: string): QuestionType {
  const band = bucket === 'challenge' || bucket === 'cross' ? 2 : difficulty <= 1 ? 0 : difficulty <= 3 ? 1 : 2;
  const pool = TYPE_BANDS[band]!.filter((t) => t !== avoid);
  const fresh = pool.filter((t) => !typesSeen.includes(t));
  const pick = fresh.length ? fresh : pool;
  return pick[Math.floor(rng() * pick.length)] ?? QUESTION_TYPES[0];
}
