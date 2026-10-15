import { KNOWLEDGE, QUESTION_BANK, QuestionInput } from '@psc/shared';
import type { DB } from './index';

/**
 * Seeds a profile DB with curated "to learn" content: the question bank (as source 'imported',
 * so it also shows in Questions and export) and knowledge snippets (FTS-indexed by trigger).
 * Idempotent: INSERT OR IGNORE keyed by id, so re-running or upgrading is safe.
 */
export function seedContent(db: DB): { questions: number; knowledge: number } {
  const now = Date.now();
  let questions = 0;
  let knowledge = 0;

  const insertQ = db.prepare(
    "INSERT OR IGNORE INTO questions (id, concept_id, type, difficulty, source, json, created_at) VALUES (?, ?, ?, ?, 'imported', ?, ?)",
  );
  const insertK = db.prepare('INSERT OR IGNORE INTO knowledge (id, concept_id, title, content, source_url, created_at) VALUES (?, ?, ?, ?, ?, ?)');

  db.transaction(() => {
    for (const raw of QUESTION_BANK) {
      const q = QuestionInput.parse(raw); // validates conceptId against the taxonomy
      const id = q.id!;
      const info = insertQ.run(id, q.conceptId, q.type, q.difficulty, JSON.stringify({ ...q, id }), now);
      questions += info.changes;
    }
    for (const kn of KNOWLEDGE) {
      const info = insertK.run(kn.id, kn.conceptId, kn.title, kn.content, kn.sourceUrl ?? null, now);
      knowledge += info.changes;
    }
  })();

  return { questions, knowledge };
}
