import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ProfilesDTO, SessionDTO } from '@psc/shared';
import { MockProvider } from '../src/ai/mock';
import { buildApp } from '../src/app';
import type { AppContext } from '../src/context';

let dir: string;
let app: FastifyInstance;
let ctx: AppContext;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psc-prof-'));
  ({ app, ctx } = await buildApp({ dataDir: dir, provider: new MockProvider() }));
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { preferGenerated: 0 } }); // use the seeded bank
});
afterEach(async () => {
  await app.close();
  ctx.profiles.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const json = async <T = any>(method: string, url: string, payload?: unknown) => {
  const r = await app.inject({ method: method as 'GET', url: `/api${url}`, payload: payload as object });
  return { status: r.statusCode, body: r.json() as T };
};

describe('profiles', () => {
  it('starts with one seeded Default profile', async () => {
    const { body } = await json<ProfilesDTO>('GET', '/profiles');
    expect(body.profiles).toHaveLength(1);
    expect(body.profiles[0]).toMatchObject({ name: 'Default', active: true });
    expect(body.activeId).toBe(body.profiles[0]!.id);
    // Seeded curated bank is present in this profile.
    const qs = (await json('GET', '/questions?source=imported')).body as unknown[];
    expect(qs.length).toBeGreaterThanOrEqual(40);
  });

  it('keeps progress, settings and questions fully separate per profile', async () => {
    // Progress in Default.
    let s = (await json<SessionDTO>('POST', '/sessions', { mode: 'quick' })).body;
    while (s.current) {
      await json('POST', `/sessions/${s.id}/answer`, { questionId: s.current.id, answer: 'x'.repeat(400), durationMs: 1000, confidence: 3 });
      s = (await json<SessionDTO>('POST', `/sessions/${s.id}/next`)).body;
    }
    await json('POST', `/sessions/${s.id}/end`);
    await json('PUT', '/settings', { learnerName: 'Alice', dailyGoal: 25 });
    const defaultAssessed = ((await json('GET', '/concepts')).body as { attempts: number }[]).filter((c) => c.attempts > 0).length;
    expect(defaultAssessed).toBe(5);

    // New profile Bob: created, seeded, active, and a clean slate.
    const bob = (await json('POST', '/profiles', { name: 'Bob' })).body;
    expect(bob).toMatchObject({ name: 'Bob', active: true });
    expect(((await json('GET', '/profiles')).body as ProfilesDTO).activeId).toBe(bob.id);
    expect(((await json('GET', '/concepts')).body as { attempts: number }[]).filter((c) => c.attempts > 0)).toHaveLength(0);
    expect((await json('GET', '/settings')).body.dailyGoal).toBe(10); // default, not Alice's 25
    expect(((await json('GET', '/questions?source=imported')).body as unknown[]).length).toBeGreaterThanOrEqual(40); // Bob seeded too

    // Switching back restores Default's progress and settings.
    const defId = ((await json('GET', '/profiles')).body as ProfilesDTO).profiles.find((p) => p.name === 'Default')!.id;
    await json('POST', `/profiles/${defId}/activate`);
    expect(((await json('GET', '/concepts')).body as { attempts: number }[]).filter((c) => c.attempts > 0)).toHaveLength(5);
    expect((await json('GET', '/settings')).body).toMatchObject({ learnerName: 'Alice', dailyGoal: 25 });
  });

  it('rejects duplicate names and renames', async () => {
    expect((await json('POST', '/profiles', { name: 'Default' })).status).toBe(409);
    const defId = ((await json('GET', '/profiles')).body as ProfilesDTO).activeId;
    expect((await json('PATCH', `/profiles/${defId}`, { name: 'Primary' })).body.name).toBe('Primary');
    expect((await json('POST', '/profiles', { name: '  ' })).status).toBe(400);
  });

  it('deletes a profile, refusing the last one, and switches away from the active one', async () => {
    const defId = ((await json('GET', '/profiles')).body as ProfilesDTO).activeId;
    expect((await json('DELETE', `/profiles/${defId}`)).status).toBe(409); // only profile
    const bob = (await json('POST', '/profiles', { name: 'Bob' })).body; // now active
    expect((await json('DELETE', `/profiles/${bob.id}`)).body).toEqual({ ok: true });
    const after = (await json('GET', '/profiles')).body as ProfilesDTO;
    expect(after.profiles).toHaveLength(1);
    expect(after.activeId).toBe(defId); // switched back to the remaining one
    expect(fs.existsSync(path.join(dir, `profile-${bob.id}.db`))).toBe(false); // file removed
  });

  it('persists the active profile across restarts', async () => {
    const bob = (await json('POST', '/profiles', { name: 'Bob' })).body;
    await app.close();
    ctx.profiles.close();
    ({ app, ctx } = await buildApp({ dataDir: dir, provider: new MockProvider() }));
    expect(((await json('GET', '/profiles')).body as ProfilesDTO).activeId).toBe(bob.id);
  });
});
