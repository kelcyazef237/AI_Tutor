import { nanoid } from 'nanoid';
import {
  DIAGRAM_TOPIC_INDEX,
  DiagramLayoutOverrides,
  DiagramSpec,
  normalizeSpec,
  sanitizeLayout,
  type DiagramChatMessageDTO,
  type DiagramChatRequest,
  type DiagramDTO,
  type DiagramExplainRequest,
  type DiagramExplainResponse,
  type DiagramGenerateRequest,
  type DiagramRefinement,
  type DiagramSummaryDTO,
  type DiagramUpdateRequest,
} from '@psc/shared';
import type { AppContext } from '../context';
import { HttpError } from '../errors';

interface DiagramRow {
  id: string;
  title: string;
  subtitle: string;
  topic: string;
  prompt: string;
  spec_json: string;
  layout_json: string;
  model: string;
  refinements_json: string;
  created_at: number;
  updated_at: number;
}

interface ChatRow {
  id: number;
  diagram_id: string;
  role: 'user' | 'assistant';
  content: string;
  focus_json: string | null;
  created_at: number;
}

const MAX_REFINEMENTS = 20;

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Diagram Studio store + AI orchestration. The DB keeps the spec JSON (the editable
 * artifact); the client renders it with the shared layout engine. Every spec that
 * enters the DB has been Zod-validated and semantically normalised.
 */
export class DiagramStudio {
  constructor(
    private ctx: AppContext,
    private clock: () => number = Date.now,
  ) {}

  private get db() {
    return this.ctx.db();
  }

  private row(id: string): DiagramRow {
    const r = this.db.prepare('SELECT * FROM diagrams WHERE id = ?').get(id) as DiagramRow | undefined;
    if (!r) throw new HttpError(404, 'Diagram not found.');
    return r;
  }

  private toSummary(r: DiagramRow): DiagramSummaryDTO {
    const spec = parseJson<DiagramSpec | null>(r.spec_json, null);
    return {
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      topic: r.topic,
      prompt: r.prompt,
      nodeCount: spec?.nodes?.length ?? 0,
      stepCount: spec?.steps?.length ?? 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private toDto(r: DiagramRow): DiagramDTO {
    const raw = parseJson<DiagramSpec | null>(r.spec_json, null);
    if (!raw) throw new HttpError(500, 'Stored diagram spec is unreadable.');
    // Repair on read too: specs written by older prompts may have drifted.
    const { spec } = normalizeSpec(raw);
    const layout = sanitizeLayout(parseJson(r.layout_json, { nodes: {}, zones: {} }), spec);
    return {
      ...this.toSummary(r),
      spec,
      layout,
      model: r.model,
      refinements: parseJson<DiagramRefinement[]>(r.refinements_json, []),
    };
  }

  list(): DiagramSummaryDTO[] {
    const rows = this.db.prepare('SELECT * FROM diagrams ORDER BY updated_at DESC').all() as DiagramRow[];
    return rows.map((r) => this.toSummary(r));
  }

  get(id: string): DiagramDTO {
    return this.toDto(this.row(id));
  }

  async generate(req: DiagramGenerateRequest): Promise<DiagramDTO> {
    const topic = req.topic ? DIAGRAM_TOPIC_INDEX.get(req.topic) : undefined;
    if (req.topic && !topic) throw new HttpError(404, 'Unknown diagram topic.');
    const prompt = req.prompt.trim();
    if (!topic && !prompt) throw new HttpError(400, 'Pick a topic or describe the diagram you want.');

    const generated = await this.ctx.ai().diagramSpec({ topic: topic?.id ?? '', prompt });
    const { spec } = normalizeSpec(generated);

    const now = this.clock();
    const id = nanoid(12);
    this.db
      .prepare(
        `INSERT INTO diagrams (id, title, subtitle, topic, prompt, spec_json, model, refinements_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`,
      )
      .run(id, spec.title, spec.subtitle, topic?.id ?? '', prompt, JSON.stringify(spec), this.ctx.ai().providerName, now, now);
    return this.get(id);
  }

  async refine(id: string, instruction: string): Promise<DiagramDTO> {
    const r = this.row(id);
    const current = this.toDto(r).spec;
    const updated = await this.ctx.ai().diagramRefine({ spec: current, instruction });
    const { spec } = normalizeSpec(updated);

    const refinements: DiagramRefinement[] = parseJson<DiagramRefinement[]>(r.refinements_json, []);
    refinements.unshift({ instruction, at: this.clock() });
    const now = this.clock();
    this.db
      .prepare('UPDATE diagrams SET title = ?, subtitle = ?, spec_json = ?, model = ?, refinements_json = ?, updated_at = ? WHERE id = ?')
      .run(spec.title, spec.subtitle, JSON.stringify(spec), this.ctx.ai().providerName, JSON.stringify(refinements.slice(0, MAX_REFINEMENTS)), now, id);
    return this.get(id);
  }

  /** Label edits (full spec) and/or dragged positions. Positions are pruned
   *  against the spec so a refine that removes a node never leaves dead entries. */
  update(id: string, req: DiagramUpdateRequest): DiagramDTO {
    const r = this.row(id);
    if (!req.spec && !req.layout) throw new HttpError(400, 'Nothing to update.');
    const currentSpec = this.toDto(r).spec;
    const spec = req.spec ? normalizeSpec(req.spec).spec : currentSpec;
    const layout = req.layout ? sanitizeLayout(DiagramLayoutOverrides.parse(req.layout), spec) : sanitizeLayout(parseJson(r.layout_json, { nodes: {}, zones: {} }), spec);
    const now = this.clock();
    this.db
      .prepare('UPDATE diagrams SET title = ?, subtitle = ?, spec_json = ?, layout_json = ?, updated_at = ? WHERE id = ?')
      .run(spec.title, spec.subtitle, JSON.stringify(spec), JSON.stringify(layout), now, id);
    return this.get(id);
  }

  /** Plain-language explanation for one element. When one is already stored the AI
   *  goes deeper (concrete example) instead of repeating itself. */
  async explain(id: string, target: DiagramExplainRequest): Promise<DiagramExplainResponse> {
    const dto = this.get(id);
    const existing =
      target.kind === 'node' ? dto.spec.nodes.find((n) => n.id === target.id)?.explain : dto.spec.edges.find((e) => e.id === target.id)?.explain;
    const explanation = await this.ctx.ai().explainEntity({ spec: dto.spec, kind: target.kind, id: target.id, deeper: Boolean(existing) });
    if (!explanation) throw new HttpError(404, 'No such node or edge in this diagram.');
    return { explanation };
  }

  /* ── per-diagram chat ─────────────────────────────────────── */

  listChat(id: string): DiagramChatMessageDTO[] {
    this.row(id);
    const rows = this.db.prepare('SELECT * FROM diagram_messages WHERE diagram_id = ? ORDER BY id').all(id) as ChatRow[];
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      focus: parseJson<DiagramChatMessageDTO['focus']>(r.focus_json ?? 'null', null),
      at: r.created_at,
    }));
  }

  /** Ask a question about this diagram. The turn is only recorded when the AI replies. */
  async ask(id: string, req: DiagramChatRequest): Promise<DiagramChatMessageDTO[]> {
    const dto = this.get(id);
    const history = this.listChat(id).map((m) => ({ role: m.role, content: m.content }));
    const reply = await this.ctx.ai().diagramChat({ spec: dto.spec, history, message: req.message, focus: req.focus ?? null });

    const now = this.clock();
    const ins = this.db.prepare('INSERT INTO diagram_messages (diagram_id, role, content, focus_json, created_at) VALUES (?, ?, ?, ?, ?)');
    ins.run(id, 'user', req.message, req.focus ? JSON.stringify(req.focus) : null, now);
    ins.run(id, 'assistant', reply, null, now);
    return this.listChat(id);
  }

  clearChat(id: string) {
    this.row(id);
    this.db.prepare('DELETE FROM diagram_messages WHERE diagram_id = ?').run(id);
  }

  remove(id: string) {
    this.row(id);
    this.db.prepare('DELETE FROM diagrams WHERE id = ?').run(id);
  }
}
