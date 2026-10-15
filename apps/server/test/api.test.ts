import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MockProvider } from '../src/ai/mock';
import { buildApp } from '../src/app';
import { openDb, type DB } from '../src/db';
import { SECRET_MASK } from '../src/settings';
import { AIError } from '../src/ai/provider';
import { aiStatus, recordFailure } from '../src/ai/structured';

/** Generic placeholder question — tests exercise plumbing, not content. */
const question = (over: Record<string, unknown> = {}) => ({
  conceptId: 'net.tcp',
  type: 'explain',
  difficulty: 2,
  prompt: 'Placeholder question text',
  objective: 'Placeholder objective',
  rubric: { keyPoints: ['Point one'], misconceptions: [], referenceAnswer: 'Placeholder answer' },
  ...over,
});

let db: DB;
let app: FastifyInstance;

beforeEach(async () => {
  db = openDb(':memory:');
  ({ app } = await buildApp({ db, provider: new MockProvider() }));
});
afterEach(async () => {
  await app.close();
  db.close();
});

describe('health + migrations', () => {
  it('reports ok', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
  });
  it('applies all migrations', () => {
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(1);
  });
  it('returns JSON 404s', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(r.statusCode).toBe(404);
    expect(r.json().message).toMatch(/Not found/);
  });
});

describe('settings', () => {
  it('returns defaults', async () => {
    const s = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    expect(s.provider).toBe('ollama');
    expect(s.dailyGoal).toBe(10);
  });

  it('persists a patch', async () => {
    const r = await app.inject({ method: 'PUT', url: '/api/settings', payload: { dailyGoal: 15, learnerName: 'Kel' } });
    expect(r.statusCode).toBe(200);
    const s = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    expect(s).toMatchObject({ dailyGoal: 15, learnerName: 'Kel' });
  });

  it('rejects invalid values with a readable 400', async () => {
    const r = await app.inject({ method: 'PUT', url: '/api/settings', payload: { dailyGoal: 0 } });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toMatch(/dailyGoal/);
  });

  it('masks the API key and keeps it when the mask is sent back', async () => {
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { openaiKey: 'sk-test-123' } });
    const s = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    expect(s.openaiKey).toBe(SECRET_MASK);
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { ...s, dailyGoal: 12 } });
    const row = db.prepare('SELECT json FROM settings WHERE id = 1').get() as { json: string };
    expect(JSON.parse(row.json).openaiKey).toBe('sk-test-123');
  });
});

describe('ai', () => {
  it('lists models', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/ai/models' });
    expect(r.json()).toEqual({ models: ['mock-model'] });
  });
  it('tests a model', async () => {
    const r = (await app.inject({ method: 'POST', url: '/api/ai/test', payload: { model: 'mock-model' } })).json();
    expect(r.ok).toBe(true);
    expect(typeof r.ms).toBe('number');
  });
  it('keeps a quota error through reachability refreshes until a real call succeeds', async () => {
    recordFailure('mock', new AIError('quota', 'usage limit'));
    aiStatus.checkedAt = 0; // force the status route to re-check reachability
    const st = (await app.inject({ method: 'GET', url: '/api/ai/status' })).json();
    expect(st).toMatchObject({ ok: false, kind: 'quota' });
    expect(st.checkedAt).toBeGreaterThan(0);
    await app.inject({ method: 'POST', url: '/api/ai/test', payload: { model: 'mock-model' } });
    expect((await app.inject({ method: 'GET', url: '/api/ai/status' })).json()).toMatchObject({ ok: true });
  });
  it('reports status', async () => {
    const r = (await app.inject({ method: 'GET', url: '/api/ai/status' })).json();
    expect(r).toMatchObject({ ok: true, provider: 'mock' });
  });
});

describe('questions', () => {
  it('creates, lists, updates and deletes', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/questions', payload: question() });
    expect(created.statusCode).toBe(201);
    const rec = created.json();
    expect(rec.source).toBe('custom');
    expect(rec.question.id).toBe(rec.id);

    const list = (await app.inject({ method: 'GET', url: '/api/questions' })).json();
    expect(list).toHaveLength(1);

    const upd = await app.inject({ method: 'PUT', url: `/api/questions/${rec.id}`, payload: question({ difficulty: 4 }) });
    expect(upd.json().question.difficulty).toBe(4);

    expect((await app.inject({ method: 'DELETE', url: `/api/questions/${rec.id}` })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'DELETE', url: `/api/questions/${rec.id}` })).statusCode).toBe(404);
  });

  it('rejects unknown concept ids', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/questions', payload: question({ conceptId: 'nope.nope' }) });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toMatch(/conceptId/);
  });

  it('rejects duplicate ids on create', async () => {
    await app.inject({ method: 'POST', url: '/api/questions', payload: question({ id: 'q1' }) });
    const r = await app.inject({ method: 'POST', url: '/api/questions', payload: question({ id: 'q1' }) });
    expect(r.statusCode).toBe(409);
  });

  it('filters by source, concept and text', async () => {
    await app.inject({ method: 'POST', url: '/api/questions', payload: question({ prompt: 'alpha 100%' }) });
    await app.inject({ method: 'POST', url: '/api/questions/import', payload: { questions: [question({ conceptId: 'linux.cron', prompt: 'beta' })] } });
    const get = async (qs: string) => (await app.inject({ method: 'GET', url: `/api/questions?${qs}` })).json();
    expect(await get('source=imported')).toHaveLength(1);
    expect(await get('conceptId=linux.cron')).toHaveLength(1);
    expect(await get('q=alpha')).toHaveLength(1);
    expect(await get('q=100%25')).toHaveLength(1); // literal %, not a wildcard
    expect(await get('q=zzz')).toHaveLength(0);
  });

  it('imports with per-item errors and updates by id', async () => {
    const r = (
      await app.inject({
        method: 'POST',
        url: '/api/questions/import',
        payload: { questions: [question({ id: 'a' }), question({ conceptId: 'bad.id' }), { nonsense: true }, question()] },
      })
    ).json();
    expect(r.imported).toBe(2);
    expect(r.updated).toBe(0);
    expect(r.errors.map((e: { index: number }) => e.index)).toEqual([1, 2]);

    const again = (await app.inject({ method: 'POST', url: '/api/questions/import', payload: { questions: [question({ id: 'a', difficulty: 5 })] } })).json();
    expect(again).toMatchObject({ imported: 0, updated: 1 });
  });

  it('exports imported and custom questions as QuestionDefs', async () => {
    await app.inject({ method: 'POST', url: '/api/questions', payload: question({ id: 'c1' }) });
    await app.inject({ method: 'POST', url: '/api/questions/import', payload: { questions: [question({ id: 'i1' })] } });
    const out = (await app.inject({ method: 'GET', url: '/api/questions/export' })).json();
    expect(out.map((q: { id: string }) => q.id).sort()).toEqual(['c1', 'i1']);
    expect(out[0]).toHaveProperty('rubric');
  });
});
