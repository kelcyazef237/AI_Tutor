import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { buildDashboard } from '../engines/analytics';

export async function dashboardRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/dashboard', async () => buildDashboard(ctx.db(), ctx.settings));
}
