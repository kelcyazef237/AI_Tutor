import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db';
import { seedContent } from '../src/db/seed';

describe('seedContent', () => {
  it('inserts the curated bank and knowledge, idempotently, and FTS works', () => {
    const db = openDb(':memory:');
    const first = seedContent(db);
    expect(first.questions).toBeGreaterThanOrEqual(40);
    expect(first.knowledge).toBeGreaterThanOrEqual(60);

    // Idempotent: a second run inserts nothing.
    expect(seedContent(db)).toEqual({ questions: 0, knowledge: 0 });

    // Questions are stored as 'imported' and parse back as valid QuestionDefs.
    const q = db.prepare("SELECT json FROM questions WHERE source = 'imported' LIMIT 1").get() as { json: string };
    expect(JSON.parse(q.json)).toHaveProperty('rubric.keyPoints');

    // Knowledge FTS returns rows for a real term.
    const hits = db.prepare("SELECT title FROM knowledge_fts WHERE knowledge_fts MATCH 'kerberos'").all();
    expect(hits.length).toBeGreaterThan(0);
  });
});
