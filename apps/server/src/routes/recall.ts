import type { FastifyInstance } from 'fastify';
import { SelfCheckRequest, StartRecallRequest, SubmitRecallRequest } from '@psc/shared';
import type { AppContext } from '../context';
import { RecallEngine } from '../engines/recall';

export async function recallRoutes(app: FastifyInstance, ctx: AppContext) {
  const engine = new RecallEngine(ctx);
  type P = { Params: { id: string } };

  app.get('/recall', async () => engine.list());
  app.post('/recall', async (req) => engine.start(StartRecallRequest.parse(req.body ?? {}).domainId));
  app.get<P>('/recall/:id', async (req) => engine.get(req.params.id));
  app.post<P>('/recall/:id/submit', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) =>
    engine.submit(req.params.id, SubmitRecallRequest.parse(req.body ?? {}).text),
  );
  app.post<P>('/recall/:id/self-check', async (req) => engine.selfCheck(req.params.id, SelfCheckRequest.parse(req.body ?? {}).items));
}
