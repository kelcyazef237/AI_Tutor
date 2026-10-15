import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AIError, classifyHttpError, type AIProvider, type ChatRequest } from '../src/ai/provider';
import { aiStatus, callStructured, extractJson, recordFailure, recordSuccess, setStatusPersistence } from '../src/ai/structured';

const Schema = z.object({ a: z.number(), b: z.string() });

/** Provider that replays a script of responses (string = reply, Error = throw). */
function scripted(script: Record<string, (string | Error)[]>): AIProvider & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  return {
    name: 'scripted',
    calls,
    async chat(req) {
      calls.push(req);
      const next = script[req.model]?.shift();
      if (next === undefined) throw new Error(`no scripted reply for ${req.model}`);
      if (next instanceof Error) throw next;
      return next;
    },
    async listModels() {
      return Object.keys(script);
    },
  };
}

const msgs = [{ role: 'user' as const, content: 'x' }];

describe('extractJson', () => {
  it('parses a bare object', () => expect(extractJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' }));
  it('parses inside code fences with prose', () => expect(extractJson('Sure!\n```json\n{"a":1,"b":"x"}\n```\nDone')).toEqual({ a: 1, b: 'x' }));
  it('tolerates trailing commas', () => expect(extractJson('{"a":1,"b":"x",}')).toEqual({ a: 1, b: 'x' }));
  it('handles braces inside strings', () => expect(extractJson('{"a":1,"b":"}{"}')).toEqual({ a: 1, b: '}{' }));
  it('throws when there is no object', () => expect(() => extractJson('no json here')).toThrow());
});

describe('classifyHttpError', () => {
  it('detects quota from status 429', () => expect(classifyHttpError(429, '{}').kind).toBe('quota'));
  it('detects quota from Ollama usage-limit text', () =>
    expect(classifyHttpError(500, '{"error":"you have reached your monthly usage limit"}').kind).toBe('quota'));
  it('maps 401 to auth', () => expect(classifyHttpError(401, '').kind).toBe('auth'));
  it('maps 404 to unavailable', () => expect(classifyHttpError(404, '').kind).toBe('unavailable'));
});

describe('callStructured', () => {
  it('returns valid output on the first try', async () => {
    const p = scripted({ m1: ['{"a":1,"b":"ok"}'] });
    const r = await callStructured({ provider: p, models: ['m1'], schema: Schema, messages: msgs });
    expect(r).toEqual({ data: { a: 1, b: 'ok' }, model: 'm1' });
    expect(p.calls).toHaveLength(1);
    expect(aiStatus.ok).toBe(true);
  });

  it('asks the same model to repair invalid output', async () => {
    const p = scripted({ m1: ['{"a":"not a number"}', '{"a":2,"b":"fixed"}'] });
    const r = await callStructured({ provider: p, models: ['m1'], schema: Schema, messages: msgs });
    expect(r.data).toEqual({ a: 2, b: 'fixed' });
    expect(p.calls).toHaveLength(2);
    expect(p.calls[1]!.messages.at(-1)!.content).toMatch(/not valid/);
  });

  it('falls back to the next model when one is unavailable', async () => {
    const p = scripted({ m1: [new AIError('unavailable', 'down', 'm1')], m2: ['{"a":3,"b":"m2"}'] });
    const r = await callStructured({ provider: p, models: ['m1', 'm2'], schema: Schema, messages: msgs });
    expect(r.model).toBe('m2');
  });

  it('falls back after a failed repair', async () => {
    const p = scripted({ m1: ['garbage', 'still garbage'], m2: ['{"a":4,"b":"m2"}'] });
    const r = await callStructured({ provider: p, models: ['m1', 'm2'], schema: Schema, messages: msgs });
    expect(r.model).toBe('m2');
  });

  it('aborts immediately on quota errors without trying fallbacks', async () => {
    const p = scripted({ m1: [new AIError('quota', 'usage limit', 'm1')], m2: ['{"a":5,"b":"never"}'] });
    await expect(callStructured({ provider: p, models: ['m1', 'm2'], schema: Schema, messages: msgs })).rejects.toMatchObject({ kind: 'quota' });
    expect(p.calls.map((c) => c.model)).toEqual(['m1']);
    expect(aiStatus).toMatchObject({ ok: false, kind: 'quota' });
  });

  it('dedupes the model chain', async () => {
    const p = scripted({ m1: [new AIError('unavailable', 'down', 'm1')] });
    await expect(callStructured({ provider: p, models: ['m1', 'm1', ''], schema: Schema, messages: msgs })).rejects.toMatchObject({ kind: 'unavailable' });
    expect(p.calls).toHaveLength(1);
  });
});

describe('status persistence', () => {
  it('loads a saved status and saves every change', () => {
    const saved: unknown[] = [];
    setStatusPersistence(
      () => ({ ok: false, provider: 'ollama', kind: 'quota', message: 'saved limit', checkedAt: 1 }),
      (st) => saved.push({ ...st }),
    );
    expect(aiStatus).toMatchObject({ ok: false, kind: 'quota', message: 'saved limit' });
    recordFailure('ollama', new AIError('auth', 'bad key'));
    recordSuccess('ollama');
    expect(saved).toMatchObject([{ kind: 'auth' }, { ok: true }]);
    setStatusPersistence(() => null, () => {}); // detach for other tests
  });
});
