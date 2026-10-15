import { nanoid } from 'nanoid';
import {
  AREAS,
  CONCEPT_BY_ID,
  DOMAIN_BY_ID,
  SIM_LOOP,
  SimWorld,
  type SimDebrief,
  type SimGraphNode,
  type SimLoopStage,
  type SimPhase,
  type SimStepOutput,
  type SimTranscriptEntry,
  type SimulationDTO,
  type SimulationSummaryDTO,
  type StartSimulationRequest,
} from '@psc/shared';
import type { AppContext } from '../context';
import { parseJson } from '../db';
import { HttpError } from '../errors';
import { applyEvidence, masteryBand } from './mastery';
import { schedule } from './scheduler';
import { allStates, bumpActivity, getState, saveState } from './studentModel';

/**
 * Pentest Simulation. The world model is generated once, kept server-side, and handed to
 * the simulator on every step so evidence stays consistent. The client only sees what
 * the student has uncovered.
 */

interface SimRow {
  id: string;
  title: string;
  world_json: string;
  started_at: number;
  ended_at: number | null;
  phase: SimPhase;
  status: 'active' | 'ended';
  graph_json: string;
  loop_json: string;
  objectives_json: string;
  debrief_json: string | null;
  difficulty: number;
  focus: string;
  self_debrief: string | null;
}

interface StepRow {
  id: number;
  role: 'user' | 'system';
  content: string;
  meta_json: string | null;
  created_at: number;
}

interface StepMeta {
  mentorNote?: string;
  phase?: SimPhase;
  reasoning?: SimTranscriptEntry['reasoning'];
  objectiveCompleted?: string | null;
}

/** Running tallies stored in loop_json. */
interface LoopState {
  actions: number;
  counts: Record<SimLoopStage, number>;
  phasesReached: SimPhase[];
  over: boolean;
}

const emptyLoop = (): LoopState => ({
  actions: 0,
  counts: { observation: 0, hypothesis: 0, test: 0, evidence: 0, conclusion: 0 },
  phasesReached: ['recon'],
  over: false,
});

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Human-readable label for a focus id (domain, area or empty). */
export function focusLabel(focus: string): string {
  if (DOMAIN_BY_ID[focus]) return DOMAIN_BY_ID[focus]!.name;
  const area = AREAS.find((a) => a.id === focus);
  if (area) return area.name;
  return 'Mixed engagement (network, web and host)';
}

export class SimulationEngine {
  constructor(
    private ctx: AppContext,
    private clock: () => number = Date.now,
  ) {}

  private get db() {
    return this.ctx.db();
  }

  private row(id: string): SimRow {
    const r = this.db.prepare('SELECT * FROM simulations WHERE id = ?').get(id) as SimRow | undefined;
    if (!r) throw new HttpError(404, 'Simulation not found.');
    return r;
  }

  private world(r: SimRow): SimWorld {
    return parseJson<SimWorld>(r.world_json, {} as SimWorld);
  }

  private steps(id: string): StepRow[] {
    return this.db.prepare('SELECT * FROM sim_steps WHERE sim_id = ? ORDER BY id').all(id) as StepRow[];
  }

  private dto(r: SimRow): SimulationDTO {
    const w = this.world(r);
    const loop = parseJson<LoopState>(r.loop_json, emptyLoop());
    const counts = { ...emptyLoop().counts, ...loop.counts };
    const ended = r.status === 'ended';
    return {
      id: r.id,
      title: r.title,
      briefing: w.briefing,
      scope: w.scope,
      attackerModel: w.attackerModel,
      credentials: w.credentials,
      timeLimitMinutes: w.timeLimitMinutes,
      difficulty: r.difficulty,
      focus: r.focus,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      status: r.status,
      phase: r.phase,
      phasesReached: loop.phasesReached?.length ? loop.phasesReached : ['recon'],
      objectives: parseJson(r.objectives_json, []),
      transcript: this.steps(r.id).map((s) => {
        const m = parseJson<StepMeta>(s.meta_json, {});
        return { id: s.id, role: s.role, content: s.content, at: s.created_at, ...m };
      }),
      graph: parseJson<SimGraphNode[]>(r.graph_json, []),
      loop: Object.fromEntries(SIM_LOOP.map(({ key }) => [key, loop.actions ? counts[key] / loop.actions : 0])) as Record<SimLoopStage, number>,
      actions: loop.actions,
      engagementOver: !!loop.over,
      debrief: parseJson<SimDebrief | null>(r.debrief_json, null),
      selfDebrief: r.self_debrief,
      reveal: ended
        ? {
            intendedChain: w.intendedChain,
            vulnerabilities: w.vulnerabilities.map((v) => ({ title: v.title, host: w.hosts.find((h) => h.id === v.hostId)?.hostname ?? v.hostId, detail: v.detail })),
          }
        : null,
    };
  }

  /** Short learner profile for the world generator, built from the student model. */
  private profile(): string {
    const states = [...allStates(this.db)].filter(([, s]) => s.attempts > 0);
    if (!states.length) return 'New learner; no assessment history yet.';
    const sorted = states.sort((a, b) => a[1].mastery - b[1].mastery);
    const name = (id: string) => CONCEPT_BY_ID[id]?.name ?? id;
    const weak = sorted.slice(0, 4).map(([id, s]) => `${name(id)} (${masteryBand(s.mastery)})`);
    const strong = sorted.slice(-4).reverse().map(([id, s]) => `${name(id)} (${masteryBand(s.mastery)})`);
    return `Assessed on ${states.length} concepts. Weakest: ${weak.join(', ')}. Strongest: ${strong.join(', ')}.`;
  }

  async start(req: StartSimulationRequest): Promise<SimulationDTO> {
    if (req.focus && !DOMAIN_BY_ID[req.focus] && !AREAS.some((a) => a.id === req.focus)) throw new HttpError(400, `Unknown focus: ${req.focus}`);
    const world = await this.ctx.ai().simWorld({ focus: focusLabel(req.focus), difficulty: req.difficulty, student: this.profile() });
    world.concepts = world.concepts.filter((c) => CONCEPT_BY_ID[c]);
    const id = nanoid(12);
    const now = this.clock();
    this.db
      .prepare(
        `INSERT INTO simulations (id, title, world_json, started_at, phase, status, graph_json, loop_json, objectives_json, difficulty, focus)
         VALUES (?, ?, ?, ?, 'recon', 'active', '[]', ?, ?, ?, ?)`,
      )
      .run(id, world.title, JSON.stringify(world), now, JSON.stringify(emptyLoop()), JSON.stringify(world.objectives.map((text) => ({ text, done: false }))), req.difficulty, req.focus);
    return this.dto(this.row(id));
  }

  get(id: string): SimulationDTO {
    return this.dto(this.row(id));
  }

  list(): SimulationSummaryDTO[] {
    const rows = this.db.prepare('SELECT * FROM simulations ORDER BY started_at DESC').all() as SimRow[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      difficulty: r.difficulty,
      focus: r.focus,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      status: r.status,
      phase: r.phase,
      actions: parseJson<LoopState>(r.loop_json, emptyLoop()).actions,
      overall: parseJson<SimDebrief | null>(r.debrief_json, null)?.overall ?? null,
    }));
  }

  remove(id: string) {
    this.row(id);
    this.db.prepare('DELETE FROM simulations WHERE id = ?').run(id);
  }

  async action(id: string, action: string): Promise<SimulationDTO> {
    const r = this.row(id);
    if (r.status !== 'active') throw new HttpError(409, 'This engagement has ended.');
    const world = this.world(r);
    const graph = parseJson<SimGraphNode[]>(r.graph_json, []);
    const transcript = this.steps(id).map((s) => ({ role: s.role, content: s.content }));

    // Nothing is stored until the simulator answers, so a failed call can simply be retried.
    const out = await this.ctx.ai().simStep({ world, transcript, action, phase: r.phase, discovered: graph.map((n) => n.id) });
    this.applyStep(r, action, out, graph);
    return this.dto(this.row(id));
  }

  private applyStep(r: SimRow, action: string, out: SimStepOutput, graph: SimGraphNode[]) {
    const now = this.clock();
    const loop = { ...emptyLoop(), ...parseJson<LoopState>(r.loop_json, emptyLoop()) };
    const stages = SIM_LOOP.map((s) => s.key).filter((k) => out.reasoning[k]);
    loop.actions++;
    for (const k of stages) loop.counts[k]++;
    if (!loop.phasesReached.includes(out.phase)) loop.phasesReached.push(out.phase);
    if (out.engagement_over) loop.over = true;

    const objectives = parseJson<{ text: string; done: boolean }[]>(r.objectives_json, []);
    if (out.objective_completed) {
      const done = norm(out.objective_completed);
      for (const o of objectives) if (!o.done && (norm(o.text).includes(done) || done.includes(norm(o.text)))) o.done = true;
    }
    if (objectives.length && objectives.every((o) => o.done)) loop.over = true;

    this.db.transaction(() => {
      this.db.prepare("INSERT INTO sim_steps (sim_id, role, content, created_at) VALUES (?, 'user', ?, ?)").run(r.id, action, now);
      const meta: StepMeta = {
        mentorNote: out.mentor_note || undefined,
        phase: out.phase,
        reasoning: { actionQuality: out.reasoning.action_quality, reasoningQuality: out.reasoning.reasoning_quality, stages },
        objectiveCompleted: out.objective_completed ?? null,
      };
      const sys = this.db.prepare("INSERT INTO sim_steps (sim_id, role, content, meta_json, created_at) VALUES (?, 'system', ?, ?, ?)").run(r.id, out.evidence, JSON.stringify(meta), now);
      const stepId = Number(sys.lastInsertRowid);

      const ids = new Set(graph.map((n) => n.id));
      for (const d of out.discovered) {
        const existing = graph.find((n) => n.id === d.id);
        if (existing) {
          existing.label = d.label || existing.label;
          continue;
        }
        graph.push({ id: d.id, kind: d.kind, label: d.label, parent: null, discoveredAt: stepId });
        ids.add(d.id);
      }
      // Resolve parents after all new nodes exist; unknown parents become roots.
      for (const d of out.discovered) {
        const n = graph.find((x) => x.id === d.id)!;
        if (d.parent && ids.has(d.parent) && d.parent !== d.id) n.parent = d.parent;
      }

      this.db
        .prepare('UPDATE simulations SET phase = ?, graph_json = ?, loop_json = ?, objectives_json = ? WHERE id = ?')
        .run(out.phase, JSON.stringify(graph), JSON.stringify(loop), JSON.stringify(objectives), r.id);
    })();
  }

  /**
   * Ends the engagement and debriefs it. Safe to call again if the debrief failed.
   * The learner's own debrief (written first) is kept and handed to the coach for comparison.
   */
  async end(id: string, selfDebrief = ''): Promise<SimulationDTO> {
    let r = this.row(id);
    const now = this.clock();
    if (selfDebrief && !r.debrief_json) {
      this.db.prepare('UPDATE simulations SET self_debrief = ? WHERE id = ?').run(selfDebrief, id);
      r = this.row(id);
    }
    if (r.status === 'active') {
      this.db.prepare("UPDATE simulations SET status = 'ended', ended_at = ? WHERE id = ?").run(now, id);
      bumpActivity(this.db, now, { sessions: 1, minutes: (now - r.started_at) / 60_000 });
      r = this.row(id);
    }
    if (r.debrief_json) return this.dto(r);
    const transcript = this.steps(id).map((s) => ({ role: s.role, content: s.content }));
    if (!transcript.length) return this.dto(r); // nothing to debrief

    const debrief = await this.ctx.ai().simDebrief({ world: this.world(r), transcript, selfDebrief: r.self_debrief ?? '' });
    this.db.transaction(() => {
      this.db.prepare('UPDATE simulations SET debrief_json = ? WHERE id = ?').run(JSON.stringify(debrief), id);
      this.applyDebrief(r, debrief);
    })();
    return this.dto(this.row(id));
  }

  /** Simulation evidence is attack-path reasoning in context: strong evidence, still clamped per concept. */
  private applyDebrief(r: SimRow, d: SimDebrief) {
    const now = this.clock();
    const seen = new Set<string>();
    for (const u of d.concept_updates) {
      if (!CONCEPT_BY_ID[u.concept] || seen.has(u.concept)) continue;
      seen.add(u.concept);
      const before = getState(this.db, u.concept);
      const result = u.score >= 0.75 ? 'correct' : u.score >= 0.4 ? 'partial' : 'incorrect';
      const applied = applyEvidence(before, {
        score: u.score,
        result,
        difficulty: r.difficulty,
        type: 'attack-path',
        now,
        scores: {
          correctness: u.score,
          conceptual_understanding: u.score,
          reasoning_quality: d.reasoning_loop.hypothesis * 0.5 + d.reasoning_loop.conclusion * 0.5,
          pentest_application: u.score,
          observation_vs_hypothesis: d.reasoning_loop.observation * 0.5 + d.reasoning_loop.hypothesis * 0.5,
        },
      });
      saveState(this.db, u.concept, { ...applied.state, ...schedule(before, applied.outcome, now) }, now);
    }
  }
}
