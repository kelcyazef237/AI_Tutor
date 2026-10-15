import { describe, expect, it } from 'vitest';
import { CONCEPT_BY_ID, CONCEPTS } from '@psc/shared';
import { applyEvidence, emptyState, MAX_STEP, masteryDelta, type Evidence, type MasteryState } from '../src/engines/mastery';
import { conceptStatus, LADDER_HOURS, schedule } from '../src/engines/scheduler';
import { allocate, interleave, planSession, preferredType, PREREQ_OK, type SelectorState } from '../src/engines/selector';
import { lastDays, streaks } from '../src/engines/analytics';

const NOW = new Date('2026-10-13T12:00:00').getTime();
const H = 3_600_000;

const ev = (over: Partial<Evidence> = {}): Evidence => ({ score: 1, result: 'correct', difficulty: 3, type: 'scenario', now: NOW, ...over });
const st = (over: Partial<MasteryState> = {}): MasteryState => ({ ...emptyState(), ...over });

describe('mastery', () => {
  it('never moves more than MAX_STEP per answer, even when the AI proposes more', () => {
    for (const s of [st(), st({ mastery: 3 }), st({ mastery: 6.9, confidence: 0.9 })]) {
      expect(Math.abs(masteryDelta(s, ev({ difficulty: 5, type: 'attack-path', aiDelta: 5 })))).toBeLessThanOrEqual(MAX_STEP + 1e-9);
      expect(Math.abs(masteryDelta(s, ev({ score: 0, result: 'incorrect', difficulty: 1, aiDelta: -5 })))).toBeLessThanOrEqual(MAX_STEP + 1e-9);
    }
  });

  it('stays within 0..7', () => {
    expect(applyEvidence(st({ mastery: 0.05 }), ev({ score: 0, result: 'incorrect', difficulty: 1 })).state.mastery).toBeGreaterThanOrEqual(0);
    expect(applyEvidence(st({ mastery: 6.95 }), ev({ difficulty: 5 })).state.mastery).toBeLessThanOrEqual(7);
  });

  it('a hard scenario counts more than an easy definition', () => {
    const base = st({ mastery: 2, attempts: 3, typesSeen: ['conceptual', 'scenario'] });
    const hard = masteryDelta(base, ev({ difficulty: 4, type: 'scenario' }));
    const easy = masteryDelta(base, ev({ difficulty: 1, type: 'conceptual' }));
    expect(hard).toBeGreaterThan(easy * 2);
  });

  it('ignores an AI proposal that contradicts the result', () => {
    const s = st({ mastery: 3, attempts: 2 });
    expect(masteryDelta(s, ev({ score: 0.1, result: 'incorrect', aiDelta: 0.35 }))).toBeLessThan(0);
  });

  it('self-graded evidence counts less', () => {
    const s = st({ mastery: 1, attempts: 1, typesSeen: ['scenario'] });
    expect(masteryDelta(s, ev({ selfGraded: true }))).toBeCloseTo(masteryDelta(s, ev()) / 2, 5);
  });

  it('confidence grows only across distinct question types', () => {
    let s = st();
    for (let i = 0; i < 6; i++) s = applyEvidence(s, ev({ type: 'explain', difficulty: 2 })).state;
    const sameType = s.confidence;
    expect(sameType).toBeLessThanOrEqual(0.4);
    for (const type of ['scenario', 'command', 'attack-path'] as const) s = applyEvidence(s, ev({ type, difficulty: 3 })).state;
    expect(s.confidence).toBeGreaterThan(sameType + 0.15);
  });

  it('a failed review cuts confidence harder', () => {
    const s = st({ mastery: 4, confidence: 0.7, attempts: 5, typesSeen: ['scenario'], nextReview: NOW - H });
    const notDue = { ...s, nextReview: NOW + H };
    const fail = ev({ score: 0, result: 'incorrect' });
    expect(applyEvidence(s, fail).state.confidence).toBeLessThan(applyEvidence(notDue, fail).state.confidence);
    expect(applyEvidence(s, fail).review).toBe(true);
  });
});

describe('scheduler', () => {
  it('climbs the ladder on success and resets on failure', () => {
    let s = { intervalHours: 0, ease: 2.5 };
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = schedule(s, 'success', NOW);
      seen.push(s.intervalHours);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]!);
    expect(seen[0]).toBeGreaterThanOrEqual(LADDER_HOURS[0]);
    expect(seen.at(-1)).toBeGreaterThan(1000);
    const failed = schedule(s, 'failure', NOW);
    expect(failed.intervalHours).toBe(LADDER_HOURS[0]);
    expect(failed.ease).toBeLessThan(s.ease);
    expect(failed.nextReview).toBe(NOW + LADDER_HOURS[0] * H);
  });

  it('partial repeats the current rung', () => {
    const two = schedule(schedule({ intervalHours: 0, ease: 2.5 }, 'success', NOW), 'success', NOW);
    const p = schedule(two, 'partial', NOW);
    expect(p.intervalHours).toBeLessThanOrEqual(two.intervalHours);
    expect(p.intervalHours).toBeGreaterThan(LADDER_HOURS[0]);
  });

  it('derives status', () => {
    expect(conceptStatus(st(), NOW)).toBe('unknown');
    expect(conceptStatus(st({ attempts: 1, mastery: 1, nextReview: NOW + H }), NOW)).toBe('learning');
    expect(conceptStatus(st({ attempts: 1, mastery: 5, confidence: 0.6, nextReview: NOW + H }), NOW)).toBe('solid');
    expect(conceptStatus(st({ attempts: 1, mastery: 3, nextReview: NOW - H, intervalHours: 48 }), NOW)).toBe('review-due');
    expect(conceptStatus(st({ attempts: 1, mastery: 3, nextReview: NOW - 72 * H, intervalHours: 48 }), NOW)).toBe('at-risk');
  });
});

describe('selector', () => {
  const rng = () => {
    let x = 42;
    return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
  };
  const s = (over: Partial<SelectorState>): SelectorState => ({ ...emptyState(), ...over });

  it('allocates the default split exactly', () => {
    const a = allocate(20, { weak: 40, reinforce: 25, new: 20, cross: 10, challenge: 5 });
    expect(Object.fromEntries(a)).toEqual({ weak: 8, reinforce: 5, new: 4, cross: 2, challenge: 1 });
    expect([...allocate(5, { weak: 40, reinforce: 25, new: 20, cross: 10, challenge: 5 }).values()].reduce((x, y) => x + y)).toBe(5);
  });

  it('cold start: only foundation concepts (prerequisites met)', () => {
    const plan = planSession({ mode: 'standard', now: NOW, domains: [], states: new Map(), misconceptions: new Set(), rng: rng() });
    expect(plan).toHaveLength(10);
    for (const slot of plan) expect(CONCEPT_BY_ID[slot.conceptId]!.prereqs).toEqual([]);
    expect(new Set(plan.map((x) => x.conceptId)).size).toBe(10);
  });

  it('gates new material behind prerequisites, even inside a domain filter', () => {
    const plan = planSession({ mode: 'quick', now: NOW, domains: ['dns'], states: new Map(), misconceptions: new Set(), rng: rng() });
    expect(plan.length).toBeGreaterThan(0);
    // dns.recursive needs net.udp, which needs net.tcpip … so the plan starts at the frontier.
    for (const slot of plan) expect(CONCEPT_BY_ID[slot.conceptId]!.prereqs).toEqual([]);
    expect(plan.some((x) => x.bucket === 'prereq')).toBe(true);
  });

  it('pulls a weak prerequisite in before a repeatedly failed concept', () => {
    const states = new Map<string, SelectorState>([
      ['net.tcp', s({ attempts: 3, mastery: 0.5, failStreak: 2 })],
      ['net.tcpip', s({ attempts: 2, mastery: 0.4, failStreak: 1 })],
    ]);
    const plan = planSession({ mode: 'weakness', now: NOW, domains: [], states, misconceptions: new Set(), rng: rng() });
    const ids = plan.map((x) => x.conceptId);
    expect(plan.find((x) => x.conceptId === 'net.tcpip')).toMatchObject({ bucket: 'prereq' });
    // The weak prerequisite is practised before the concept that depends on it.
    if (ids.includes('net.tcp')) expect(ids.indexOf('net.tcpip')).toBeLessThan(ids.indexOf('net.tcp'));
    // net.osi is an unlearned prerequisite of net.tcpip, so it comes first.
    if (ids.includes('net.osi')) expect(ids.indexOf('net.osi')).toBeLessThan(ids.indexOf('net.tcpip'));
  });

  it('review mode only uses assessed concepts, most overdue first', () => {
    const states = new Map<string, SelectorState>([
      ['net.osi', s({ attempts: 2, mastery: 3, successStreak: 2, nextReview: NOW - 1 * H, intervalHours: 48 })],
      ['net.tcp', s({ attempts: 2, mastery: 3, successStreak: 2, nextReview: NOW - 40 * H, intervalHours: 48 })],
      ['linux.processes', s({ attempts: 2, mastery: 3, successStreak: 2, nextReview: NOW + 40 * H, intervalHours: 48 })],
    ]);
    const plan = planSession({ mode: 'review', now: NOW, domains: [], states, misconceptions: new Set(), rng: rng() });
    expect(plan[0]!.conceptId).toBe('net.tcp'); // most overdue first, then interleaved
    expect(plan.map((x) => x.conceptId).sort()).toEqual(['linux.processes', 'net.osi', 'net.tcp']);
    expect(planSession({ mode: 'review', now: NOW, domains: [], states: new Map(), misconceptions: new Set() })).toEqual([]);
  });

  it('challenge mode asks hard questions', () => {
    const states = new Map(CONCEPTS.slice(0, 12).map((c) => [c.id, s({ attempts: 4, mastery: 3, successStreak: 2, confidence: 0.5, nextReview: NOW + 99 * H })]));
    const plan = planSession({ mode: 'challenge', now: NOW, domains: [], states, misconceptions: new Set(), rng: rng() });
    expect(plan.length).toBe(6);
    for (const slot of plan) expect(slot.difficulty).toBeGreaterThanOrEqual(4);
    expect(plan.some((x) => x.bucket === 'cross' && x.secondaryId && CONCEPT_BY_ID[x.secondaryId]!.area !== CONCEPT_BY_ID[x.conceptId]!.area)).toBe(true);
  });

  it('treats prerequisites at PREREQ_OK as satisfied', () => {
    const states = new Map([['net.osi', s({ attempts: 2, mastery: PREREQ_OK, successStreak: 1 })]]);
    const plan = planSession({ mode: 'deep', now: NOW, domains: ['net'], states, misconceptions: new Set(), rng: rng() });
    expect(plan.some((x) => x.conceptId === 'net.tcpip' && x.bucket === 'new')).toBe(true);
  });
});

describe('interleaving', () => {
  it('alternates domains and keeps prerequisites first', () => {
    const plan = planSession({ mode: 'deep', now: NOW, domains: [], states: new Map(), misconceptions: new Set(), rng: (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646; })() });
    const domains = plan.map((x) => CONCEPT_BY_ID[x.conceptId]!.domainId);
    let same = 0;
    for (let i = 1; i < domains.length; i++) if (domains[i] === domains[i - 1]) same++;
    expect(same).toBeLessThanOrEqual(2);
    const order = interleave([
      { bucket: 'new', conceptId: 'net.tcpip', difficulty: 1 },
      { bucket: 'new', conceptId: 'net.osi', difficulty: 1 },
      { bucket: 'new', conceptId: 'linux.processes', difficulty: 1 },
    ]).map((x) => x.conceptId);
    expect(order.indexOf('net.osi')).toBeLessThan(order.indexOf('net.tcpip'));
    expect(order[1]).toBe('linux.processes'); // domain switch between the two networking items
  });

  it('never repeats the previous question type when it can avoid it', () => {
    for (let i = 0; i < 50; i++) expect(preferredType(1, [], 'new', Math.random, 'explain')).not.toBe('explain');
  });
});

describe('calibration in the mastery engine', () => {
  it('a confident wrong answer cuts confidence more; a lucky guess gains less', () => {
    const s = st({ mastery: 3, confidence: 0.6, attempts: 4, typesSeen: ['scenario'], maxDiffPassed: 3 });
    const wrong = ev({ score: 0, result: 'incorrect' });
    expect(applyEvidence(s, { ...wrong, predicted: 4 }).state.confidence).toBeLessThan(applyEvidence(s, { ...wrong, predicted: 2 }).state.confidence);
    const right = ev({ difficulty: 5 });
    expect(masteryDelta(s, { ...right, predicted: 1 })).toBeLessThan(masteryDelta(s, { ...right, predicted: 3 }) / 2);
  });
});

describe('analytics helpers', () => {
  it('counts streaks across month boundaries and tolerates an inactive today', () => {
    const days = new Set(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-11', '2026-10-12']);
    expect(streaks(days, NOW)).toEqual({ streak: 2, longest: 3 });
    expect(lastDays(3, NOW)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13']);
  });
});
