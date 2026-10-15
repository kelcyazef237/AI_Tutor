import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { openDb, type DB } from './index';

/**
 * Multi-user by name, with no login. Each profile has its OWN database file, so the whole
 * learning schema and every engine query stay single-tenant and untouched. A tiny registry DB
 * tracks the profiles and which one is active. Switching a profile swaps the active handle.
 */
export interface ProfileRow {
  id: string;
  name: string;
  createdAt: number;
  lastActive: number;
}

export interface ProfileManager {
  /** The active profile's learning DB. */
  active(): DB;
  activeId(): string;
  /** Small DB safe for global state (e.g. persisted AI status). */
  registry(): DB;
  list(): ProfileRow[];
  get(id: string): ProfileRow | undefined;
  /** Creates and seeds a profile. Does not switch to it. */
  create(name: string): ProfileRow;
  rename(id: string, name: string): ProfileRow;
  activate(id: string): ProfileRow;
  remove(id: string): void;
  /** Fired after the active profile changes (switch or create-and-switch). */
  onSwitch(fn: () => void): void;
  close(): void;
}

const REGISTRY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS profiles (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at  INTEGER NOT NULL,
    last_active INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const toRow = (r: { id: string; name: string; created_at: number; last_active: number }): ProfileRow => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at,
  lastActive: r.last_active,
});

/** Production manager: one SQLite file per profile under `dataDir`, plus a registry. */
export class FileProfiles implements ProfileManager {
  private reg: DB;
  private current!: DB;
  private currentId!: string;
  private listeners: (() => void)[] = [];

  constructor(
    private dataDir: string,
    private seed: (db: DB) => void,
  ) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.reg = new Database(path.join(dataDir, 'profiles.db'));
    this.reg.pragma('journal_mode = WAL');
    this.reg.exec(REGISTRY_SCHEMA);

    if (!this.list().length) this.create('Default', path.join(dataDir, 'coach.db'));
    const savedId = (this.reg.prepare("SELECT value FROM kv WHERE key = 'active_profile'").get() as { value: string } | undefined)?.value;
    const start = (savedId && this.get(savedId)) || this.list()[0]!;
    this.open(start.id);
  }

  private file(id: string) {
    return path.join(this.dataDir, `profile-${id}.db`);
  }

  private open(id: string) {
    if (this.current && this.currentId !== id) this.current.close();
    const file = (this.get(id) as (ProfileRow & { file?: string }) | undefined)?.file ?? this.file(id);
    this.current = openDb(file);
    this.currentId = id;
    this.reg.prepare("INSERT INTO kv (key, value) VALUES ('active_profile', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(id);
    this.reg.prepare('UPDATE profiles SET last_active = ? WHERE id = ?').run(Date.now(), id);
  }

  active() {
    return this.current;
  }
  activeId() {
    return this.currentId;
  }
  registry() {
    return this.reg;
  }

  list() {
    return (this.reg.prepare('SELECT * FROM profiles ORDER BY last_active DESC').all() as Parameters<typeof toRow>[0][]).map(toRow);
  }
  get(id: string) {
    const r = this.reg.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Parameters<typeof toRow>[0] | undefined;
    return r && toRow(r);
  }

  /** `file` lets the very first "Default" profile adopt the legacy coach.db path. */
  create(name: string, file?: string): ProfileRow {
    const clean = name.trim();
    if (!clean) throw Object.assign(new Error('Profile name is required.'), { statusCode: 400 });
    if (clean.length > 60) throw Object.assign(new Error('Profile name is too long.'), { statusCode: 400 });
    if (this.reg.prepare('SELECT 1 FROM profiles WHERE name = ? COLLATE NOCASE').get(clean))
      throw Object.assign(new Error(`A profile named "${clean}" already exists.`), { statusCode: 409 });
    const id = nanoid(10);
    const now = Date.now();
    const target = file ?? this.file(id);
    const db = openDb(target);
    this.seed(db);
    db.close();
    if (file) fs.copyFileSync(file, this.file(id)); // normalize to the standard path
    this.reg.prepare('INSERT INTO profiles (id, name, created_at, last_active) VALUES (?, ?, ?, ?)').run(id, clean, now, now);
    return this.get(id)!;
  }

  rename(id: string, name: string): ProfileRow {
    const clean = name.trim();
    if (!clean) throw Object.assign(new Error('Profile name is required.'), { statusCode: 400 });
    if (!this.get(id)) throw Object.assign(new Error('Profile not found.'), { statusCode: 404 });
    if (this.reg.prepare('SELECT 1 FROM profiles WHERE name = ? COLLATE NOCASE AND id != ?').get(clean, id))
      throw Object.assign(new Error(`A profile named "${clean}" already exists.`), { statusCode: 409 });
    this.reg.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(clean, id);
    return this.get(id)!;
  }

  activate(id: string): ProfileRow {
    if (!this.get(id)) throw Object.assign(new Error('Profile not found.'), { statusCode: 404 });
    if (id !== this.currentId) {
      this.open(id);
      for (const fn of this.listeners) fn();
    }
    return this.get(id)!;
  }

  remove(id: string) {
    if (!this.get(id)) throw Object.assign(new Error('Profile not found.'), { statusCode: 404 });
    if (this.list().length <= 1) throw Object.assign(new Error('You cannot delete your only profile.'), { statusCode: 409 });
    const wasActive = id === this.currentId;
    if (wasActive) {
      const next = this.list().find((p) => p.id !== id)!;
      this.open(next.id);
    }
    this.reg.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(this.file(id) + suffix, { force: true });
    if (wasActive) for (const fn of this.listeners) fn();
  }

  onSwitch(fn: () => void) {
    this.listeners.push(fn);
  }
  close() {
    this.current?.close();
    this.reg.close();
  }
}

/** Test manager: a single in-memory DB presented as one fixed profile. No switching. */
export class SingleProfile implements ProfileManager {
  private row: ProfileRow = { id: 'default', name: 'Default', createdAt: Date.now(), lastActive: Date.now() };
  constructor(private db: DB) {}
  active() {
    return this.db;
  }
  activeId() {
    return this.row.id;
  }
  registry() {
    return this.db;
  }
  list() {
    return [this.row];
  }
  get(id: string) {
    return id === this.row.id ? this.row : undefined;
  }
  create(): ProfileRow {
    throw Object.assign(new Error('Multiple profiles are not available here.'), { statusCode: 409 });
  }
  rename(_id: string, name: string): ProfileRow {
    this.row = { ...this.row, name: name.trim() };
    return this.row;
  }
  activate(id: string): ProfileRow {
    if (id !== this.row.id) throw Object.assign(new Error('Profile not found.'), { statusCode: 404 });
    return this.row;
  }
  remove(): void {
    throw Object.assign(new Error('You cannot delete your only profile.'), { statusCode: 409 });
  }
  onSwitch() {}
  close() {}
}
