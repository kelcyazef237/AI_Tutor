import type { FastifyInstance } from 'fastify';
import { CreateProfileRequest, RenameProfileRequest, type ProfileDTO, type ProfilesDTO } from '@psc/shared';
import type { AppContext } from '../context';
import type { ProfileRow } from '../db/profiles';

export async function profileRoutes(app: FastifyInstance, ctx: AppContext) {
  const p = ctx.profiles;
  const toDTO = (r: ProfileRow): ProfileDTO => ({ id: r.id, name: r.name, createdAt: r.createdAt, lastActive: r.lastActive, active: r.id === p.activeId() });
  const payload = (): ProfilesDTO => ({ profiles: p.list().map(toDTO), activeId: p.activeId() });

  app.get('/profiles', async () => payload());

  app.post('/profiles', async (req) => {
    const { name } = CreateProfileRequest.parse(req.body ?? {});
    const created = p.create(name);
    p.activate(created.id); // new profile becomes active
    return toDTO(p.get(created.id)!);
  });

  app.post<{ Params: { id: string } }>('/profiles/:id/activate', async (req) => toDTO(p.activate(req.params.id)));

  app.patch<{ Params: { id: string } }>('/profiles/:id', async (req) => {
    const { name } = RenameProfileRequest.parse(req.body ?? {});
    return toDTO(p.rename(req.params.id, name));
  });

  app.delete<{ Params: { id: string } }>('/profiles/:id', async (req) => {
    p.remove(req.params.id);
    return { ok: true };
  });
}
