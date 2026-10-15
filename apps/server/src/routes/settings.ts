import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';

export async function settingsRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/settings', async () => ctx.settings.publicView());

  app.put('/settings', async (req) => {
    ctx.settings.update(req.body ?? {});
    return ctx.settings.publicView();
  });
}
