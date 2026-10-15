import type { DB } from './db';
import type { ProfileManager } from './db/profiles';
import type { AIOperations } from './ai/operations';
import type { AIProvider } from './ai/provider';
import type { SettingsStore } from './settings';

/** Shared services handed to every route module. */
export interface AppContext {
  /** The active profile's learning database. Re-read per request; it changes on profile switch. */
  db(): DB;
  profiles: ProfileManager;
  settings: SettingsStore;
  /** Current provider; rebuilt when provider settings change. */
  provider(): AIProvider;
  ai(): AIOperations;
}
