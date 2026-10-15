import type { FastifyInstance } from 'fastify';
import { AnswerRequest, SelfGradeRequest, SessionReflection, StartSessionRequest } from '@psc/shared';
import type { AppContext } from '../context';
import { SessionEngine } from '../engines/session';
import { conceptStates } from '../engines/studentModel';

export async function sessionRoutes(app: FastifyInstance, ctx: AppContext) {
  const engine = new SessionEngine(ctx);
  const ai = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
  type P = { Params: { id: string } };

  app.get('/sessions', async () => engine.list());
  app.post('/sessions', ai, async (req) => engine.start(StartSessionRequest.parse(req.body ?? {})));
  app.get<P>('/sessions/:id', async (req) => engine.get(req.params.id));
  app.get<P>('/sessions/:id/attempts', async (req) => engine.attempts(req.params.id));
  app.post<P>('/sessions/:id/answer', ai, async (req) => engine.answer(req.params.id, AnswerRequest.parse(req.body ?? {})));
  app.post<P>('/sessions/:id/next', ai, async (req) => engine.next(req.params.id));
  app.post<P>('/sessions/:id/end', ai, async (req) => engine.end(req.params.id));
  app.put<P>('/sessions/:id/reflection', async (req) => engine.reflect(req.params.id, SessionReflection.parse(req.body ?? {})));
  app.post<P>('/attempts/:id/self-grade', async (req) => engine.selfGrade(req.params.id, SelfGradeRequest.parse(req.body ?? {}).score));
  app.get('/concepts', async () => conceptStates(ctx.db()));
}
