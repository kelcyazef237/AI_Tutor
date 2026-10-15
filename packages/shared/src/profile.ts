import { z } from 'zod';

/**
 * Profiles: multiple learners by name on one local install, each with fully separate progress.
 *
 *  GET    /api/profiles              → { profiles: ProfileDTO[]; activeId: string }
 *  POST   /api/profiles   { name }   → ProfileDTO                (created and made active)
 *  POST   /api/profiles/:id/activate → ProfileDTO                (switch active profile)
 *  PATCH  /api/profiles/:id  { name }→ ProfileDTO                (rename)
 *  DELETE /api/profiles/:id          → { ok: true }              (cannot delete the only one)
 * The active profile scopes every other endpoint (sessions, dashboard, concepts, …).
 */
export const CreateProfileRequest = z.object({ name: z.string().trim().min(1).max(60) });
export const RenameProfileRequest = CreateProfileRequest;

export interface ProfileDTO {
  id: string;
  name: string;
  createdAt: number;
  lastActive: number;
  active: boolean;
}
export interface ProfilesDTO {
  profiles: ProfileDTO[];
  activeId: string;
}
