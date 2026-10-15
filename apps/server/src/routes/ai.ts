import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { AIError } from '../ai/provider';
import { aiStatus, recordFailure, recordSuccess, touchStatus } from '../ai/structured';

/**
 * Cheap reachability check (lists models; spends no tokens).
 * Quota problems only surface on real calls, which update the status themselves.
 */
export async function refreshAIStatus(ctx: AppContext) {
  const p = ctx.provider();
  try {
    await p.listModels();
    // Listing models proves reachability only. Keep a quota/auth error until a real call succeeds.
    const sticky = !aiStatus.ok && (aiStatus.kind === 'quota' || aiStatus.kind === 'auth') && aiStatus.provider === p.name;
    if (sticky) touchStatus();
    else recordSuccess(p.name);
  } catch (e) {
    recordFailure(p.name, e instanceof AIError ? e : new AIError('unknown', (e as Error).message));
  }
}

export async function aiRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/ai/status', async () => {
    if (Date.now() - aiStatus.checkedAt > 60_000) await refreshAIStatus(ctx);
    return aiStatus;
  });

  app.get('/ai/models', async () => ({ models: await ctx.ai().listModels() }));

  app.post(
    '/ai/test',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { model } = z.object({ model: z.string().min(1) }).parse(req.body ?? {});
      const provider = ctx.provider();
      const t0 = Date.now();
      try {
        const reply = await ctx.ai().ping(model);
        recordSuccess(provider.name);
        return { ok: true, message: reply, ms: Date.now() - t0 };
      } catch (e) {
        const err = e instanceof AIError ? e : new AIError('unknown', (e as Error).message, model);
        recordFailure(provider.name, err);
        return { ok: false, message: err.message, kind: err.kind, ms: Date.now() - t0 };
      }
    },
  );
}
