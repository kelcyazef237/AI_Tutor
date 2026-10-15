import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DiagramSpec, layout, normalizeSpec, sanitizeLayout } from '@psc/shared';
import { MockProvider } from '../src/ai/mock';
import { buildApp } from '../src/app';
import { openDb, type DB } from '../src/db';

const baseSpec = () =>
  DiagramSpec.parse({
    title: 'T',
    subtitle: '',
    alt: 'alt',
    zones: [
      { id: 'z1', label: 'ZONE', tone: 'brand', col: 1, span: 6 },
      { id: 'z2', label: 'OTHER', tone: 'plain', col: 7, span: 6 },
    ],
    nodes: [
      { id: 'a', title: 'A', icon: 'server', zone: 'z1', step: 1 },
      { id: 'b', title: 'B', icon: 'laptop', zone: 'z2', step: 2 },
    ],
    edges: [{ id: 'e1', from: 'a', to: 'b', step: 2 }],
    notes: [{ zone: 'z1', text: 'note' }],
    steps: [
      { title: '1 · One', caption: 'one' },
      { title: '2 · Two', caption: 'two' },
    ],
  });

describe('normalizeSpec', () => {
  it('drops dangling edges and self-loops', () => {
    const spec = baseSpec();
    spec.edges.push(
      { ...spec.edges[0]!, id: 'dangling', to: 'nope' },
      { ...spec.edges[0]!, id: 'loop', to: 'a' },
    );
    const { spec: out, repairs } = normalizeSpec(spec);
    expect(out.edges.map((e) => e.id)).toEqual(['e1']);
    expect(repairs.some((r) => r.includes('dangling'))).toBe(true);
    expect(repairs.some((r) => r.includes('self-loop'))).toBe(true);
  });

  it('raises an edge step so it never appears before its endpoints', () => {
    const spec = baseSpec();
    spec.edges[0]!.step = 1; // b appears at step 2
    const { spec: out } = normalizeSpec(spec);
    expect(out.edges[0]!.step).toBe(2);
  });

  it('falls back to the box icon and drops unknown zones', () => {
    const spec = baseSpec();
    spec.nodes[0] = { ...spec.nodes[0]!, icon: 'not-a-real-icon' as never, zone: 'ghost' };
    const { spec: out } = normalizeSpec(spec);
    expect(out.nodes[0]!.icon).toBe('box');
    expect(out.nodes[0]!.zone).toBeUndefined();
  });

  it('renames id collisions', () => {
    const spec = baseSpec();
    spec.nodes.push({ ...spec.nodes[0]!, title: 'A again', step: 1 });
    const { spec: out } = normalizeSpec(spec);
    expect(new Set(out.nodes.map((n) => n.id)).size).toBe(out.nodes.length);
  });
});

describe('hand-arranged layout', () => {
  it('moves the node and the edge follows (links never break)', () => {
    const spec = baseSpec();
    const before = layout(spec);
    const e0 = before.edges[0]!;
    const moved = layout(spec, { nodes: { a: { x: 500, y: 400 } }, zones: {} });
    const a = moved.nodes.get('a')!;
    expect([a.x, a.y]).toEqual([500, 400]);
    // The wire now leaves from the moved card's boundary, not the old spot.
    const m0 = moved.edges[0]!;
    expect(m0.d).not.toBe(e0.d);
    const m = /^M ([\d.]+) ([\d.]+)/.exec(m0.d)!;
    const [sx, sy] = [Number(m[1]), Number(m[2])];
    expect(sx).toBeGreaterThanOrEqual(500);
    expect(sx).toBeLessThanOrEqual(500 + 172 + 0.1);
    expect(sy).toBeGreaterThanOrEqual(400);
    expect(sy).toBeLessThanOrEqual(400 + 54 + 0.1);
  });

  it('dragging a zone carries un-pinned children but not pinned ones', () => {
    const spec = baseSpec();
    const base = layout(spec);
    const z1 = base.zones.find((z) => z.spec.id === 'z1')!;
    const a0 = base.nodes.get('a')!;
    const moved = layout(spec, { nodes: { b: { x: 900, y: 700 } }, zones: { z1: { x: z1.x + 60, y: z1.y + 40 } } });
    const a1 = moved.nodes.get('a')!;
    const b1 = moved.nodes.get('b')!;
    expect(a1.x).toBe(a0.x + 60);
    expect(a1.y).toBe(a0.y + 40);
    expect([b1.x, b1.y]).toEqual([900, 700]); // pinned by its own override
  });

  it('resizes a frame and keeps its notes glued to the bottom', () => {
    const spec = baseSpec();
    const base = layout(spec);
    const z1 = base.zones.find((z) => z.spec.id === 'z1')!;
    const note0 = base.notes.find((n) => n.zone === 'z1')!;

    const resized = layout(spec, { nodes: {}, zones: { z1: { x: z1.x, y: z1.y, w: 420, h: z1.h + 80 } } });
    const z1r = resized.zones.find((z) => z.spec.id === 'z1')!;
    expect(z1r.w).toBe(420);
    expect(z1r.h).toBe(z1.h + 80);
    const note1 = resized.notes.find((n) => n.zone === 'z1')!;
    expect(note1.y).toBe(note0.y + 80);

    // Minimum size is enforced for tiny drags.
    const tiny = layout(spec, { nodes: {}, zones: { z1: { x: z1.x, y: z1.y, w: 10, h: 5 } } });
    const z1t = tiny.zones.find((z) => z.spec.id === 'z1')!;
    expect(z1t.w).toBe(80);
    expect(z1t.h).toBe(60);
  });

  it('sanitizeLayout drops unknown ids and absurd coordinates', () => {
    const spec = baseSpec();
    const clean = sanitizeLayout(
      { nodes: { a: { x: 10, y: 10 }, ghost: { x: 5, y: 5 }, bad: { x: 1e9, y: 0 } }, zones: { z1: { x: 0, y: 0, w: 400, h: 300 }, z2: { x: 0, y: 0, w: -5 } } },
      spec,
    );
    expect(Object.keys(clean.nodes)).toEqual(['a']);
    expect(Object.keys(clean.zones)).toEqual(['z1']);
    expect(clean.zones.z1).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
});

describe('diagram routes', () => {
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

  it('generates, lists, refines and deletes a diagram (mock provider)', async () => {
    const gen = await app.inject({ method: 'POST', url: '/api/diagrams', payload: { topic: 'net-tcp-handshake', prompt: '' } });
    expect(gen.statusCode).toBe(200);
    const dto = gen.json();
    expect(dto.id).toBeTruthy();
    expect(dto.spec.steps.length).toBeGreaterThanOrEqual(2);
    expect(dto.spec.nodes.length).toBeGreaterThanOrEqual(1);

    const list = (await app.inject({ method: 'GET', url: '/api/diagrams' })).json();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(dto.id);

    const get = (await app.inject({ method: 'GET', url: `/api/diagrams/${dto.id}` })).json();
    expect(get.spec.title).toBe(dto.spec.title);

    const ref = await app.inject({ method: 'POST', url: `/api/diagrams/${dto.id}/refine`, payload: { instruction: 'add a firewall' } });
    expect(ref.statusCode).toBe(200);
    expect(ref.json().refinements[0].instruction).toBe('add a firewall');

    const del = await app.inject({ method: 'DELETE', url: `/api/diagrams/${dto.id}` });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/diagrams' })).json()).toHaveLength(0);
  });

  it('saves label edits and dragged positions via PATCH', async () => {
    const dto = (await app.inject({ method: 'POST', url: '/api/diagrams', payload: { topic: '', prompt: 'anything' } })).json();
    const spec = dto.spec;
    const nodeId = spec.nodes[0].id;

    const edited = structuredClone(spec);
    edited.nodes[0].title = 'Renamed component';
    const zoneId = spec.zones[0].id;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/diagrams/${dto.id}`,
      payload: { spec: edited, layout: { nodes: { [nodeId]: { x: 300, y: 120 } }, zones: { [zoneId]: { x: 40, y: 30, w: 500, h: 360 } } } },
    });
    expect(patched.statusCode).toBe(200);
    const out = patched.json();
    expect(out.spec.nodes[0].title).toBe('Renamed component');
    expect(out.layout.nodes[nodeId]).toEqual({ x: 300, y: 120 });
    expect(out.layout.zones[zoneId]).toEqual({ x: 40, y: 30, w: 500, h: 360 });

    // Reload from DB — persisted.
    const again = (await app.inject({ method: 'GET', url: `/api/diagrams/${dto.id}` })).json();
    expect(again.spec.nodes[0].title).toBe('Renamed component');
    expect(again.layout.nodes[nodeId]).toEqual({ x: 300, y: 120 });
    expect(again.layout.zones[zoneId]).toEqual({ x: 40, y: 30, w: 500, h: 360 });

    // Overrides for ids that no longer exist get pruned.
    const pruned = await app.inject({
      method: 'PATCH',
      url: `/api/diagrams/${dto.id}`,
      payload: { layout: { nodes: { [nodeId]: { x: 10, y: 10 }, ghost: { x: 4, y: 4 } }, zones: {} } },
    });
    expect(pruned.json().layout.nodes).toEqual({ [nodeId]: { x: 10, y: 10 } });

    // Empty patch is rejected.
    expect((await app.inject({ method: 'PATCH', url: `/api/diagrams/${dto.id}`, payload: {} })).statusCode).toBe(400);
  });

  it('explains a component or connection on demand (mock)', async () => {
    const dto = (await app.inject({ method: 'POST', url: '/api/diagrams', payload: { topic: '', prompt: 'x' } })).json();
    const ex = await app.inject({ method: 'POST', url: `/api/diagrams/${dto.id}/explain`, payload: { kind: 'node', id: dto.spec.nodes[0].id } });
    expect(ex.statusCode).toBe(200);
    expect(ex.json().explanation).toMatch(/Mock explanation/);

    const ex2 = await app.inject({ method: 'POST', url: `/api/diagrams/${dto.id}/explain`, payload: { kind: 'edge', id: dto.spec.edges[0].id } });
    expect(ex2.statusCode).toBe(200);

    const nf = await app.inject({ method: 'POST', url: `/api/diagrams/${dto.id}/explain`, payload: { kind: 'node', id: 'ghost' } });
    expect(nf.statusCode).toBe(404);

    const bad = await app.inject({ method: 'POST', url: `/api/diagrams/${dto.id}/explain`, payload: { kind: 'zone', id: 'lab' } });
    expect(bad.statusCode).toBe(400);
  });

  it('keeps a saved per-diagram chat (mock)', async () => {
    const dto = (await app.inject({ method: 'POST', url: '/api/diagrams', payload: { topic: '', prompt: 'x' } })).json();
    expect((await app.inject({ method: 'GET', url: `/api/diagrams/${dto.id}/chat` })).json()).toEqual([]);

    const focus = { kind: 'node', id: dto.spec.nodes[0].id };
    const asked = await app.inject({ method: 'POST', url: `/api/diagrams/${dto.id}/chat`, payload: { message: 'Why does this matter?', focus } });
    expect(asked.statusCode).toBe(200);
    const list = asked.json();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ role: 'user', content: 'Why does this matter?', focus });
    expect(list[1].role).toBe('assistant');
    expect(list[1].content).toMatch(/Mock chat/);

    // Persisted across reloads; other diagrams keep their own.
    expect((await app.inject({ method: 'GET', url: `/api/diagrams/${dto.id}/chat` })).json()).toHaveLength(2);

    // Empty question is rejected.
    expect((await app.inject({ method: 'POST', url: `/api/diagrams/${dto.id}/chat`, payload: { message: '   ' } })).statusCode).toBe(400);

    // Clear.
    expect((await app.inject({ method: 'DELETE', url: `/api/diagrams/${dto.id}/chat` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/diagrams/${dto.id}/chat` })).json()).toEqual([]);
  });

  it('rejects an unknown topic and an empty request', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/diagrams', payload: { topic: 'nope', prompt: '' } });
    expect(bad.statusCode).toBe(404);
    const empty = await app.inject({ method: 'POST', url: '/api/diagrams', payload: {} });
    expect(empty.statusCode).toBe(400);
  });

  it('404s unknown diagrams', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/diagrams/missing' })).statusCode).toBe(404);
  });
});
