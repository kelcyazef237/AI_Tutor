import type { FastifyInstance } from 'fastify';
import { EndSimulationRequest, SimActionRequest, StartSimulationRequest } from '@psc/shared';
import type { AppContext } from '../context';
import { SimulationEngine } from '../engines/simulation';

export async function simulationRoutes(app: FastifyInstance, ctx: AppContext) {
  const engine = new SimulationEngine(ctx);
  const ai = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  type P = { Params: { id: string } };

  app.get('/simulations', async () => engine.list());
  app.post('/simulations', ai, async (req) => engine.start(StartSimulationRequest.parse(req.body ?? {})));
  app.get<P>('/simulations/:id', async (req) => engine.get(req.params.id));
  app.post<P>('/simulations/:id/action', ai, async (req) => engine.action(req.params.id, SimActionRequest.parse(req.body ?? {}).action));
  app.post<P>('/simulations/:id/end', ai, async (req) => engine.end(req.params.id, EndSimulationRequest.parse(req.body ?? {}).selfDebrief));
  app.delete<P>('/simulations/:id', async (req) => {
    engine.remove(req.params.id);
    return { ok: true };
  });
}
