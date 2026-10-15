import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DashboardDTO, SessionDTO, SimulationDTO } from '@psc/shared';
import { MockProvider } from '../src/ai/mock';
import { AIError, type AIProvider, type ChatRequest } from '../src/ai/provider';
import { buildApp } from '../src/app';
import { openDb, type DB } from '../src/db';

/** Mock that can be switched into "quota exhausted" mode. */
class FlakyProvider implements AIProvider {
  readonly name = 'mock';
  down = false;
  private inner = new MockProvider();
  async chat(req: ChatRequest) {
    if (this.down) throw new AIError('quota', 'monthly usage limit reached', req.model);
    return this.inner.chat(req);
  }
  async listModels() {
    return ['mock-model'];
  }
}

const LONG = 'x'.repeat(400); // mock evaluator: long answer → correct
const MEDIUM = 'x'.repeat(150); // → partial + follow-up
const placeholder = (conceptId: string, i: number) => ({
  id: `bank-${conceptId}-${i}`,
  conceptId,
  type: 'explain',
  difficulty: 1,
  prompt: `Placeholder question ${i}`,
  objective: 'Placeholder objective',
  rubric: { keyPoints: ['Placeholder point'], misconceptions: [], referenceAnswer: 'Placeholder answer' },
});

let db: DB;
let app: FastifyInstance;
let provider: FlakyProvider;

beforeEach(async () => {
  db = openDb(':memory:');
  provider = new FlakyProvider();
  ({ app } = await buildApp({ db, provider }));
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { preferGenerated: 1 } });
});
afterEach(async () => {
  await app.close();
  db.close();
});

const post = async <T = any>(url: string, payload: unknown = {}) => {
  const r = await app.inject({ method: 'POST', url: `/api${url}`, payload: payload as object });
  return { status: r.statusCode, body: r.json() as T };
};
const get = async <T = any>(url: string) => (await app.inject({ method: 'GET', url: `/api${url}` })).json() as T;
const answer = (s: SessionDTO, text: string, skipped = false) => post(`/sessions/${s.id}/answer`, { questionId: s.current!.id, answer: text, durationMs: 60_000, skipped });

describe('sessions', () => {
  it('runs a quick session end to end and updates the student model', async () => {
    let s = (await post<SessionDTO>('/sessions', { mode: 'quick' })).body;
    expect(s.total).toBe(5);
    expect(s.greeting).toMatch(/first session/i);
    expect(s.current).toMatchObject({ isFollowUp: false, source: 'generated' });
    while (s.current) {
      const r = await answer(s, LONG);
      expect(r.body.kind).toBe('evaluated');
      expect(r.body.evaluation.masteryAfter).toBeGreaterThan(r.body.evaluation.masteryBefore);
      s = (await post<SessionDTO>(`/sessions/${s.id}/next`)).body;
    }
    const end = (await post(`/sessions/${s.id}/end`)).body;
    expect(end.summary).toMatchObject({ answered: 5, results: { correct: 5, partial: 0, incorrect: 0 } });
    expect(end.summary.masteryChange).toBeGreaterThan(0);
    expect(end.evaluations).toHaveLength(5);
    expect(end.masteryChanges).toHaveLength(5);

    const concepts = await get<any[]>('/concepts');
    expect(concepts).toHaveLength(concepts.length);
    expect(concepts.filter((c) => c.attempts > 0)).toHaveLength(5);
    expect(concepts.find((c) => c.attempts > 0).nextReview).toBeGreaterThan(Date.now());

    const list = await get<any[]>('/sessions');
    expect(list[0]).toMatchObject({ id: s.id, answered: 5 });
    expect(list[0].concepts.length).toBeGreaterThan(0);
    const attempts = await get<any[]>(`/sessions/${s.id}/attempts`);
    expect(attempts).toHaveLength(5);
    expect(attempts[0]).toMatchObject({ result: 'correct', selfGraded: false, isFollowUp: false });
  });

  it('runs the follow-up loop (at most two) without counting follow-ups as questions', async () => {
    const s = (await post<SessionDTO>('/sessions', { mode: 'quick' })).body;
    const r1 = (await answer(s, MEDIUM)).body;
    expect(r1.evaluation.followUp).toMatchObject({ isFollowUp: true });
    expect(r1.session.answered).toBe(1);

    const fu1 = { ...s, current: r1.evaluation.followUp };
    const r2 = (await answer(fu1, MEDIUM)).body;
    expect(r2.evaluation.followUp).toBeTruthy();
    const r3 = (await answer({ ...s, current: r2.evaluation.followUp }, MEDIUM)).body;
    expect(r3.evaluation.followUp).toBeNull(); // capped
    expect(r3.session.answered).toBe(1);

    const next = (await post<SessionDTO>(`/sessions/${s.id}/next`)).body;
    expect(next.current!.isFollowUp).toBe(false);
    expect(next.current!.id).not.toBe(s.current!.id);
    const attempts = await get<any[]>(`/sessions/${s.id}/attempts`);
    expect(attempts.filter((a) => a.isFollowUp)).toHaveLength(2);
  });

  it('rejects stale or duplicate answers and refuses to skip ahead', async () => {
    const s = (await post<SessionDTO>('/sessions', { mode: 'quick' })).body;
    expect((await post(`/sessions/${s.id}/answer`, { questionId: 'nope', answer: 'a', durationMs: 1 })).status).toBe(409);
    const same = (await post<SessionDTO>(`/sessions/${s.id}/next`)).body;
    expect(same.current!.id).toBe(s.current!.id); // unanswered: no advance
    await answer(s, LONG);
    expect((await answer(s, LONG)).status).toBe(409);
    expect((await post('/sessions', { mode: 'quick', domains: ['bogus'] })).status).toBe(400);
    expect((await post('/sessions/missing/next')).status).toBe(404);
  });

  it('skipping counts as a miss without calling the AI', async () => {
    const s = (await post<SessionDTO>('/sessions', { mode: 'quick' })).body;
    provider.down = true;
    const r = (await answer(s, '', true)).body;
    expect(r.kind).toBe('evaluated');
    expect(r.evaluation.result).toBe('incorrect');
    expect(r.evaluation.feedback).toMatch(/skipped/i);
  });

  it('exam mode hides feedback until the end', async () => {
    let s = (await post<SessionDTO>('/sessions', { mode: 'exam' })).body;
    expect(s.feedbackMode).toBe('end');
    const r = (await answer(s, MEDIUM)).body;
    expect(r.kind).toBe('recorded');
    expect(r).not.toHaveProperty('evaluation');
    s = (await post<SessionDTO>(`/sessions/${s.id}/next`)).body;
    const end = (await post(`/sessions/${s.id}/end`)).body;
    expect(end.evaluations).toHaveLength(1);
    expect(end.evaluations[0].followUp).toBeNull();
  });

  it('exam answers recorded while the AI is down are graded at the end', async () => {
    const s = (await post<SessionDTO>('/sessions', { mode: 'exam' })).body;
    provider.down = true;
    expect((await answer(s, LONG)).body.kind).toBe('recorded');
    provider.down = false;
    const end = (await post(`/sessions/${s.id}/end`)).body;
    expect(end.evaluations).toHaveLength(1);
    expect(end.summary.results.correct).toBe(1);
  });

  describe('offline fallback', () => {
    it('falls back to self-grading when evaluation hits the quota', async () => {
      const s = (await post<SessionDTO>('/sessions', { mode: 'quick' })).body;
      provider.down = true;
      const r = (await answer(s, LONG)).body;
      expect(r.kind).toBe('needs_self_grade');
      expect(r.reason).toMatch(/usage limit/);
      expect(r.rubric.keyPoints.length).toBeGreaterThan(0);

      const graded = await post(`/attempts/${r.attemptId}/self-grade`, { score: 1 });
      expect(graded.body).toMatchObject({ selfGraded: true, result: 'correct' });
      expect(graded.body.masteryAfter).toBeGreaterThan(graded.body.masteryBefore);
      expect((await post(`/attempts/${r.attemptId}/self-grade`, { score: 1 })).status).toBe(409);
    });

    it('uses stored questions when generation fails, and reports the AI error when there are none', async () => {
      provider.down = true;
      const none = await post('/sessions', { mode: 'quick' });
      expect(none.status).toBe(429);
      expect(none.body.kind).toBe('quota');
      expect(await get<any[]>('/sessions')).toHaveLength(0); // nothing half-created

      await post('/questions/import', { questions: [placeholder('linux.cron', 1), placeholder('linux.cron', 2), placeholder('net.tcp', 1)] });
      const s = (await post<SessionDTO>('/sessions', { mode: 'quick' })).body;
      expect(s.current!.source).toBe('curated');
    });
  });

  it('prefers unseen curated questions when preferGenerated is 0', async () => {
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { preferGenerated: 0 } });
    await post('/questions/import', { questions: [placeholder('net.osi', 1)] });
    const s = (await post<SessionDTO>('/sessions', { mode: 'quick', domains: ['net'] })).body;
    expect(s.plan[0]!.conceptId).toBe('net.osi');
    expect(s.current!.id).toBe('bank-net.osi-1');
  });

  it('review mode refuses to start with nothing to review', async () => {
    const r = await post('/sessions', { mode: 'review' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Nothing to review/);
  });

  it('resuming after an answered question moves on', async () => {
    const s = (await post<SessionDTO>('/sessions', { mode: 'quick' })).body;
    await answer(s, LONG);
    const resumed = await get<SessionDTO>(`/sessions/${s.id}`);
    expect(resumed.current!.id).not.toBe(s.current!.id);
  });
});

describe('dashboard', () => {
  it('works on an empty database', async () => {
    const d = await get<DashboardDTO>('/dashboard');
    expect(d.activity).toHaveLength(182);
    expect(d.forecast).toHaveLength(14);
    expect(d.stats).toMatchObject({ streak: 0, today: 0, conceptsAssessed: 0 });
    expect(d.recommendation.mode).toBe('quick');
    expect(d.trend).toEqual([]);
  });

  it('reflects a finished session', async () => {
    let s = (await post<SessionDTO>('/sessions', { mode: 'quick' })).body;
    while (s.current) {
      await answer(s, s.answered % 2 ? LONG : 'short');
      s = (await post<SessionDTO>(`/sessions/${s.id}/next`)).body;
    }
    await post(`/sessions/${s.id}/end`);
    const d = await get<DashboardDTO>('/dashboard');
    expect(d.stats).toMatchObject({ streak: 1, today: 5, week: 5, conceptsAssessed: 5 });
    expect(d.activity.at(-1)).toMatchObject({ questions: 5, correct: 2 });
    expect(d.trend).toHaveLength(1);
    expect(d.weakest.length).toBeGreaterThan(0);
    expect(d.recent).toHaveLength(5);
    expect(d.misconceptions.length).toBeGreaterThan(0);
    expect(d.areas.reduce((n, a) => n + a.assessed, 0)).toBe(5);
    expect(d.forecast.reduce((n, f) => n + f.count, 0)).toBe(5);
  });
});

describe('simulations', () => {
  it('runs an engagement: start → actions → end with debrief', async () => {
    const start = await post<SimulationDTO>('/simulations', { focus: 'web', difficulty: 2 });
    expect(start.status).toBe(200);
    const sim = start.body;
    expect(sim).toMatchObject({ status: 'active', phase: 'recon', actions: 0, reveal: null, debrief: null });
    expect(JSON.stringify(sim)).not.toMatch(/intendedChain|vulnerabilities/); // world model stays hidden

    const step = (await post<SimulationDTO>(`/simulations/${sim.id}/action`, { action: 'I would enumerate DNS records for the scope because it maps the attack surface.' })).body;
    expect(step.transcript.map((t) => t.role)).toEqual(['user', 'system']);
    expect(step.graph.find((n) => n.id === 'h1-80')).toMatchObject({ parent: 'h1', kind: 'service' });
    expect(step.loop.observation).toBe(1);
    expect(step.actions).toBe(1);

    const ended = (await post<SimulationDTO>(`/simulations/${sim.id}/end`)).body;
    expect(ended.status).toBe('ended');
    expect(ended.debrief!.overall).toBeCloseTo(0.6);
    expect(ended.reveal).toBeTruthy();
    expect((await post(`/simulations/${sim.id}/action`, { action: 'more' })).status).toBe(409);

    // Debrief evidence lands in the student model (once).
    await post(`/simulations/${sim.id}/end`);
    const recon = (await get<any[]>('/concepts')).find((c) => c.conceptId === 'method.recon');
    expect(recon.attempts).toBe(1);
    expect((await get<any[]>('/simulations'))[0]).toMatchObject({ id: sim.id, overall: 0.6, actions: 1 });
  });

  it('does not record an action when the simulator fails, and retries the debrief', async () => {
    const sim = (await post<SimulationDTO>('/simulations', {})).body;
    provider.down = true;
    const r = await post(`/simulations/${sim.id}/action`, { action: 'scan' });
    expect(r.status).toBe(429);
    provider.down = false;
    await post(`/simulations/${sim.id}/action`, { action: 'scan' });
    provider.down = true;
    expect((await post(`/simulations/${sim.id}/end`)).status).toBe(429);
    const mid = await get<SimulationDTO>(`/simulations/${sim.id}`);
    expect(mid).toMatchObject({ status: 'ended', debrief: null, actions: 1 });
    provider.down = false;
    expect((await post<SimulationDTO>(`/simulations/${sim.id}/end`)).body.debrief).toBeTruthy();
  });

  it('validates input and deletes', async () => {
    expect((await post('/simulations', { focus: 'nope' })).status).toBe(400);
    const sim = (await post<SimulationDTO>('/simulations', {})).body;
    expect((await post(`/simulations/${sim.id}/action`, { action: '   ' })).status).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: `/api/simulations/${sim.id}` })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: `/api/simulations/${sim.id}` })).statusCode).toBe(404);
  });
});

describe('calibration', () => {
  it('records stated confidence and reports calibration and confident errors', async () => {
    let s = (await post<SessionDTO>('/sessions', { mode: 'quick' })).body;
    const plan: [string, number][] = [[LONG, 4], ['short', 4], [LONG, 2], ['short', 3], [LONG, 1]];
    for (const [text, confidence] of plan) {
      const r = (await post(`/sessions/${s.id}/answer`, { questionId: s.current!.id, answer: text, durationMs: 1000, confidence })).body;
      expect(r.evaluation.predicted).toBe(confidence);
      s = (await post<SessionDTO>(`/sessions/${s.id}/next`)).body;
    }
    const attempts = await get<any[]>(`/sessions/${s.id}/attempts`);
    expect(attempts.map((a) => a.predicted)).toEqual([4, 4, 2, 3, 1]);

    const d = await get<DashboardDTO>('/dashboard');
    expect(d.calibration.rated).toBe(5);
    expect(d.calibration.levels.find((l) => l.level === 4)).toMatchObject({ answers: 2 });
    expect(d.calibration.confidentErrors).toHaveLength(2);
    expect(d.calibration.bias).not.toBeNull();
    expect(d.retention.firstTime.answers).toBe(5);
    expect(d.retention.delayed.answers).toBe(0);
  });

  it('rejects out-of-range confidence', async () => {
    const s = (await post<SessionDTO>('/sessions', { mode: 'quick' })).body;
    expect((await post(`/sessions/${s.id}/answer`, { questionId: s.current!.id, answer: 'x', durationMs: 1, confidence: 9 })).status).toBe(400);
  });
});

describe('reflection', () => {
  it('saves, returns in history and clears when empty', async () => {
    const s = (await post<SessionDTO>('/sessions', { mode: 'quick' })).body;
    const put = (body: object) => app.inject({ method: 'PUT', url: `/api/sessions/${s.id}/reflection`, payload: body });
    const r = (await put({ wentWell: 'Placeholder well', change: 'Placeholder change' })).json();
    expect(r.reflection).toEqual({ wentWell: 'Placeholder well', change: 'Placeholder change', connects: '' });
    expect((await get<any[]>('/sessions'))[0].reflection.wentWell).toBe('Placeholder well');
    expect((await put({})).json().reflection).toBeNull();
    expect((await app.inject({ method: 'PUT', url: '/api/sessions/nope/reflection', payload: {} })).statusCode).toBe(404);
  });
});

describe('free recall', () => {
  /** Give net.osi a study history so a miss on it gets scheduled. */
  const studyOsi = () =>
    db
      .prepare("INSERT INTO concept_state (concept_id, mastery, confidence, attempts, next_review, interval_hours, updated_at) VALUES ('net.osi', 2, 0.4, 3, ?, 168, ?)")
      .run(Date.now() + 5 * 86_400_000, Date.now());

  it('reviews a brain dump: credits recalled concepts, schedules studied misses, records errors', async () => {
    studyOsi();
    const r = (await post('/recall', { domainId: 'net' })).body;
    expect(r).toMatchObject({ status: 'writing', domainName: 'Networking', minutes: 10, result: null });
    const res = (await post(`/recall/${r.id}/submit`, { text: 'Routing and ARP. Also something wrong about NAT.' })).body;
    expect(res.kind).toBe('reviewed');
    const byId = Object.fromEntries(res.recall.result.concepts.map((c: any) => [c.conceptId, c]));
    expect(byId['net.routing'].recalled).toBe('solid');
    expect(byId['net.osi']).toMatchObject({ recalled: 'none', scheduled: true });
    expect(byId['net.tcp']).toMatchObject({ recalled: 'none', scheduled: false }); // never studied: nothing to review
    expect(res.recall.result.errors).toHaveLength(1);

    const concepts = await get<any[]>('/concepts');
    expect(concepts.find((c) => c.conceptId === 'net.osi').nextReview).toBeLessThanOrEqual(Date.now());
    expect(concepts.find((c) => c.conceptId === 'net.routing').attempts).toBe(1);
    expect((await get<DashboardDTO>('/dashboard')).stats.activeMisconceptions).toBe(1);
    expect((await post(`/recall/${r.id}/submit`, { text: 'again' })).status).toBe(409);
    expect((await get<any[]>('/recall'))[0].status).toBe('reviewed');
  });

  it('falls back to a self-check when the AI is unavailable', async () => {
    const r = (await post('/recall', { domainId: 'dns' })).body;
    expect((await post(`/recall/${r.id}/self-check`, { items: [] })).status).toBe(409); // must submit first
    provider.down = true;
    const res = (await post(`/recall/${r.id}/submit`, { text: 'Placeholder text' })).body;
    expect(res.kind).toBe('needs_self_check');
    expect(res.recall.text).toBe('Placeholder text');
    const done = (await post(`/recall/${r.id}/self-check`, { items: [{ conceptId: 'dns.recursive', recalled: 'solid' }] })).body;
    expect(done).toMatchObject({ status: 'reviewed', selfChecked: true });
    expect(done.result.concepts.find((c: any) => c.conceptId === 'dns.recursive').recalled).toBe('solid');
  });

  it('treats an empty page as nothing recalled without calling the AI', async () => {
    studyOsi();
    provider.down = true;
    const r = (await post('/recall', { domainId: 'net' })).body;
    const res = (await post(`/recall/${r.id}/submit`, { text: '   ' })).body;
    expect(res.kind).toBe('reviewed');
    expect(res.recall.result.concepts.every((c: any) => c.recalled === 'none')).toBe(true);
  });

  it('validates the domain', async () => {
    expect((await post('/recall', { domainId: 'nope' })).status).toBe(400);
  });
});

describe('simulation self-debrief', () => {
  it('stores the learner debrief and returns the comparison', async () => {
    const sim = (await post<SimulationDTO>('/simulations', {})).body;
    await post(`/simulations/${sim.id}/action`, { action: 'Placeholder action' });
    const ended = (await post<SimulationDTO>(`/simulations/${sim.id}/end`, { selfDebrief: 'Placeholder self debrief' })).body;
    expect(ended.selfDebrief).toBe('Placeholder self debrief');
    expect(ended.debrief!.self_assessment_feedback).toMatch(/Comparison/);
    const call = provider['inner'].calls.find((c) => c.messages.at(-1)!.content.includes('TASK: sim_debrief'))!;
    expect(call.messages.at(-1)!.content).toContain('Placeholder self debrief');
  });
});

describe('objective / focus domains', () => {
  const domainOf = (id: string) => id.split('.')[0]!;

  it('falls back to the profile focus domains (and their prerequisites) when no domains are given', async () => {
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { focusDomains: ['dns'] } });
    const s = (await post<SessionDTO>('/sessions', { mode: 'quick' })).body;
    // dns depends only on networking, so the plan stays within dns + net - never unrelated domains.
    for (const slot of s.plan) expect(['dns', 'net']).toContain(domainOf(slot.conceptId));
    expect(s.plan.some((p) => ['dns', 'net'].includes(domainOf(p.conceptId)))).toBe(true);
  });

  it('an explicit request domain overrides the profile focus', async () => {
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { focusDomains: ['dns'] } });
    const s = (await post<SessionDTO>('/sessions', { mode: 'quick', domains: ['linux'] })).body;
    expect(s.plan.some((p) => domainOf(p.conceptId) === 'linux')).toBe(true);
    expect(s.plan.some((p) => domainOf(p.conceptId) === 'dns')).toBe(false); // dns focus was overridden
  });
});
