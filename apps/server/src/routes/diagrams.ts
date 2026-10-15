import type { FastifyInstance } from 'fastify';
import { DiagramChatRequest, DiagramExplainRequest, DiagramGenerateRequest, DiagramRefineRequest, DiagramUpdateRequest } from '@psc/shared';
import type { AppContext } from '../context';
import { DiagramStudio } from '../engines/diagramStudio';

export async function diagramRoutes(app: FastifyInstance, ctx: AppContext) {
  const studio = new DiagramStudio(ctx);
  // AI generation is expensive; keep the same limiter budget as simulations.
  const ai = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  type P = { Params: { id: string } };

  app.get('/diagrams', async () => studio.list());
  app.post('/diagrams', ai, async (req) => studio.generate(DiagramGenerateRequest.parse(req.body ?? {})));
  app.get<P>('/diagrams/:id', async (req) => studio.get(req.params.id));
  app.patch<P>('/diagrams/:id', ai, async (req) => studio.update(req.params.id, DiagramUpdateRequest.parse(req.body ?? {})));
  app.post<P>('/diagrams/:id/refine', ai, async (req) => studio.refine(req.params.id, DiagramRefineRequest.parse(req.body ?? {}).instruction));
  app.post<P>('/diagrams/:id/explain', ai, async (req) => studio.explain(req.params.id, DiagramExplainRequest.parse(req.body ?? {})));
  app.get<P>('/diagrams/:id/chat', async (req) => studio.listChat(req.params.id));
  app.post<P>('/diagrams/:id/chat', ai, async (req) => studio.ask(req.params.id, DiagramChatRequest.parse(req.body ?? {})));
  app.delete<P>('/diagrams/:id/chat', async (req) => {
    studio.clearChat(req.params.id);
    return { ok: true };
  });
  app.delete<P>('/diagrams/:id', async (req) => {
    studio.remove(req.params.id);
    return { ok: true };
  });
}
