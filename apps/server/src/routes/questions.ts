import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { QUESTION_SOURCES, QuestionDef, QuestionInput, type ImportResultDTO, type QuestionRecordDTO, type QuestionSource } from '@psc/shared';
import type { AppContext } from '../context';
import { parseJson, type DB } from '../db';

interface Row {
  id: string;
  concept_id: string;
  type: string;
  difficulty: number;
  source: QuestionSource;
  json: string;
  times_asked: number;
  last_asked: number | null;
  created_at: number;
}

const MAX_IMPORT = 2000;

function toDTO(r: Row): QuestionRecordDTO {
  return {
    id: r.id,
    source: r.source,
    question: { ...parseJson<QuestionDef>(r.json, {} as QuestionDef), id: r.id },
    timesAsked: r.times_asked,
    lastAsked: r.last_asked,
    createdAt: r.created_at,
  };
}

function getRow(db: DB, id: string) {
  return db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as Row | undefined;
}

/** Insert or update one validated question. Returns whether it already existed. */
function upsert(db: DB, q: QuestionDef, source: QuestionSource): 'inserted' | 'updated' {
  const existing = getRow(db, q.id);
  const json = JSON.stringify(q);
  if (existing) {
    db.prepare('UPDATE questions SET concept_id = ?, type = ?, difficulty = ?, json = ? WHERE id = ?').run(q.conceptId, q.type, q.difficulty, json, q.id);
    return 'updated';
  }
  db.prepare('INSERT INTO questions (id, concept_id, type, difficulty, source, json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    q.id,
    q.conceptId,
    q.type,
    q.difficulty,
    source,
    json,
    Date.now(),
  );
  return 'inserted';
}

const ListQuery = z.object({
  source: z.enum(QUESTION_SOURCES).optional(),
  conceptId: z.string().optional(),
  q: z.string().max(200).optional(),
});

export async function questionRoutes(app: FastifyInstance, ctx: AppContext) {
  const db = () => ctx.db();
  app.get('/questions', async (req) => {
    const f = ListQuery.parse(req.query ?? {});
    const where: string[] = [];
    const args: unknown[] = [];
    if (f.source) (where.push('source = ?'), args.push(f.source));
    if (f.conceptId) (where.push('concept_id = ?'), args.push(f.conceptId));
    if (f.q?.trim()) (where.push('json LIKE ?'), args.push(`%${f.q.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`));
    const sql = `SELECT * FROM questions ${where.length ? `WHERE ${where.map((w) => (w.includes('LIKE') ? `${w} ESCAPE '\\'` : w)).join(' AND ')}` : ''} ORDER BY created_at DESC, id`;
    return (db().prepare(sql).all(...args) as Row[]).map(toDTO);
  });

  app.post('/questions', async (req, reply) => {
    const input = QuestionInput.parse(req.body);
    const id = input.id ?? `custom-${nanoid(10)}`;
    if (getRow(db(), id)) return reply.status(409).send({ message: `A question with id "${id}" already exists.` });
    upsert(db(), { ...input, id }, 'custom');
    return reply.status(201).send(toDTO(getRow(db(), id)!));
  });

  app.put<{ Params: { id: string } }>('/questions/:id', async (req, reply) => {
    if (!getRow(db(), req.params.id)) return reply.status(404).send({ message: 'Question not found.' });
    const input = QuestionInput.parse(req.body);
    upsert(db(), { ...input, id: req.params.id }, 'custom');
    return toDTO(getRow(db(), req.params.id)!);
  });

  app.delete<{ Params: { id: string } }>('/questions/:id', async (req, reply) => {
    const r = db().prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
    if (!r.changes) return reply.status(404).send({ message: 'Question not found.' });
    return { ok: true };
  });

  app.post('/questions/import', async (req): Promise<ImportResultDTO> => {
    const body = z.object({ questions: z.array(z.unknown()).max(MAX_IMPORT, `At most ${MAX_IMPORT} questions per import`) }).parse(req.body);
    const result: ImportResultDTO = { imported: 0, updated: 0, errors: [] };
    db().transaction(() => {
      body.questions.forEach((raw, index) => {
        const parsed = QuestionInput.safeParse(raw);
        if (!parsed.success) {
          const msg = parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.') || '(item)'}: ${i.message}`)
            .join('; ');
          result.errors.push({ index, message: msg });
          return;
        }
        const id = parsed.data.id ?? `imp-${nanoid(10)}`;
        const outcome = upsert(db(), { ...parsed.data, id }, 'imported');
        if (outcome === 'inserted') result.imported++;
        else result.updated++;
      });
    })();
    return result;
  });

  app.get('/questions/export', async () => {
    const rows = db().prepare("SELECT * FROM questions WHERE source IN ('imported', 'custom') ORDER BY created_at, id").all() as Row[];
    return rows.map((r) => toDTO(r).question);
  });
}
