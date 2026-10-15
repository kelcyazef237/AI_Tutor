import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { openDb } from './index';
import { seedContent } from './seed';

const dir = config.dataDir;
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^(profile-.*|coach)\.db$/.test(f)) : [];
if (!files.length) {
  console.log('No profile databases found. Start the server once to create the default profile.');
} else {
  for (const f of files) {
    const db = openDb(path.join(dir, f));
    const r = seedContent(db);
    db.close();
    console.log(`${f}: +${r.questions} questions, +${r.knowledge} knowledge snippets`);
  }
}
