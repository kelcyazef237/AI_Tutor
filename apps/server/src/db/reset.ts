import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

/** Deletes the profile registry and every profile DB. Everything is recreated on next start. */
let removed = 0;
if (fs.existsSync(config.dataDir)) {
  for (const f of fs.readdirSync(config.dataDir)) {
    if (/^(profiles\.db|profile-.*\.db|coach\.db)(-wal|-shm)?$/.test(f)) {
      fs.rmSync(path.join(config.dataDir, f), { force: true });
      removed++;
    }
  }
}
console.log(`Removed ${removed} database file(s) from ${config.dataDir}. A fresh seeded profile is created on next start.`);
