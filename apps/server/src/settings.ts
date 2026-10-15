import { Settings, SettingsPatch } from '@psc/shared';
import type { DB } from './db';

/** Sentinel the API returns instead of a stored API key. Sending it back means "keep the current key". */
export const SECRET_MASK = '••••••••';

export class SettingsStore {
  private cache: Settings | null = null;
  private listeners: ((s: Settings) => void)[] = [];

  /** `getDb` returns the active profile's DB, so settings are per-profile. */
  constructor(private getDb: () => DB) {}

  private get db() {
    return this.getDb();
  }

  /** Called after the active profile changes: drop the cache so the next read hits the new DB. */
  reset() {
    this.cache = null;
  }

  get(): Settings {
    if (this.cache) return this.cache;
    const row = this.db.prepare('SELECT json FROM settings WHERE id = 1').get() as { json: string } | undefined;
    let parsed: Settings;
    try {
      parsed = Settings.parse(row ? JSON.parse(row.json) : {});
    } catch {
      parsed = Settings.parse({});
    }
    this.cache = parsed;
    return parsed;
  }

  update(patch: unknown): Settings {
    const p = SettingsPatch.parse(patch);
    if (p.openaiKey === SECRET_MASK) delete p.openaiKey;
    const next = Settings.parse({ ...this.get(), ...p });
    this.db.prepare('INSERT INTO settings (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json').run(JSON.stringify(next));
    this.cache = next;
    for (const fn of this.listeners) fn(next);
    return next;
  }

  /** Settings as sent to the browser (secrets masked). */
  publicView(): Settings {
    const s = this.get();
    return { ...s, openaiKey: s.openaiKey ? SECRET_MASK : '' };
  }

  onChange(fn: (s: Settings) => void) {
    this.listeners.push(fn);
  }
}
