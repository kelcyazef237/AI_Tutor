import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { createProvider } from './ai/factory';
import { AIOperations } from './ai/operations';
import { AIError, type AIProvider } from './ai/provider';
import { aiStatus, setStatusPersistence } from './ai/structured';
import type { AppContext } from './context';
import type { DB } from './db';
import { FileProfiles, SingleProfile, type ProfileManager } from './db/profiles';
import { seedContent } from './db/seed';
import { aiRoutes, refreshAIStatus } from './routes/ai';
import { diagramRoutes } from './routes/diagrams';
import { profileRoutes } from './routes/profiles';
import { questionRoutes } from './routes/questions';
import { recallRoutes } from './routes/recall';
import { dashboardRoutes } from './routes/dashboard';
import { sessionRoutes } from './routes/sessions';
import { simulationRoutes } from './routes/simulations';
import { settingsRoutes } from './routes/settings';
import { SettingsStore } from './settings';

export interface BuildOptions {
  /** Single fixed DB (tests): one profile, no switching. */
  db?: DB;
  /** Directory holding the profile registry and per-profile DB files (production). */
  dataDir?: string;
  /** Force a provider (tests). When set, provider settings are ignored. */
  provider?: AIProvider;
  logger?: boolean | object;
  /** Built web/dist directory to serve (single-port prod). null/false = API-only. */
  webDist?: string | null | false;
  /** Extra allowed CORS origins (LAN deployments). */
  corsOrigins?: string[];
}

export async function buildApp(opts: BuildOptions) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024 });
  const profiles: ProfileManager = opts.db ? new SingleProfile(opts.db) : new FileProfiles(opts.dataDir!, seedContent);
  const settings = new SettingsStore(() => profiles.active());
  const reg = profiles.registry();

  if (!opts.provider) {
    setStatusPersistence(
      () => {
        const row = reg.prepare("SELECT value FROM kv WHERE key = 'ai_status'").get() as { value: string } | undefined;
        return row ? (JSON.parse(row.value) as typeof aiStatus) : null;
      },
      (st) => reg.prepare("INSERT INTO kv (key, value) VALUES ('ai_status', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(st)),
    );
  }

  let provider: AIProvider = opts.provider ?? createProvider(settings.get());
  let ops = new AIOperations(provider, () => settings.get());
  let providerKey = JSON.stringify([settings.get().provider, settings.get().ollamaUrl, settings.get().openaiUrl, settings.get().openaiKey]);

  const rebuildProvider = () => {
    if (opts.provider) return;
    const s = settings.get();
    const key = JSON.stringify([s.provider, s.ollamaUrl, s.openaiUrl, s.openaiKey]);
    if (key === providerKey) return;
    providerKey = key;
    provider = createProvider(s);
    ops = new AIOperations(provider, () => settings.get());
    void refreshAIStatus(ctx);
  };

  settings.onChange(rebuildProvider);
  // Switching profile swaps the DB: drop the settings cache and rebuild the provider from the new profile.
  profiles.onSwitch(() => {
    settings.reset();
    rebuildProvider();
  });

  const ctx: AppContext = { db: () => profiles.active(), profiles, settings, provider: () => provider, ai: () => ops };

  // Localhost dev servers, private-network (WLAN) origins, plus env extras.
  const origins: (RegExp | string)[] = [
    /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/,
    /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/,
    ...(opts.corsOrigins ?? []),
  ];
  await app.register(cors, { origin: origins });
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        message: err.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
          .join('; '),
      });
    }
    if (err instanceof AIError) {
      return reply.status(err.kind === 'quota' ? 429 : 503).send({ message: err.message, kind: err.kind });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.status(status).send({ message: status >= 500 ? 'Internal server error' : (err as Error).message });
  });

  app.setNotFoundHandler((req, reply) => reply.status(404).send({ message: `Not found: ${req.method} ${req.url}` }));

  app.get('/api/health', async () => ({ ok: true, ai: aiStatus }));
  await app.register(async (r) => profileRoutes(r, ctx), { prefix: '/api' });
  await app.register(async (r) => settingsRoutes(r, ctx), { prefix: '/api' });
  await app.register(async (r) => aiRoutes(r, ctx), { prefix: '/api' });
  await app.register(async (r) => questionRoutes(r, ctx), { prefix: '/api' });
  await app.register(async (r) => sessionRoutes(r, ctx), { prefix: '/api' });
  await app.register(async (r) => dashboardRoutes(r, ctx), { prefix: '/api' });
  await app.register(async (r) => simulationRoutes(r, ctx), { prefix: '/api' });
  await app.register(async (r) => diagramRoutes(r, ctx), { prefix: '/api' });
  await app.register(async (r) => recallRoutes(r, ctx), { prefix: '/api' });

  // Single-port production: serve the built Vite frontend + SPA fallback.
  // API routes above take precedence; /api 404s stay JSON.
  // (Manual file serving — avoids @fastify/static's not-found handler clash.)
  const webDist = opts.webDist ?? null;
  if (webDist && fs.existsSync(webDist) && fs.existsSync(path.join(webDist, 'index.html'))) {
    const MIME: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.map': 'application/json; charset=utf-8',
    };
    app.get('/*', async (req, reply) => {
      const rawUrl: string = req.url ?? req.raw.url ?? '/';
      const urlPath = rawUrl.split('?')[0] ?? '/';
      if (urlPath.startsWith('/api')) return reply.status(404).send({ message: `Not found: ${req.method} ${rawUrl}` });
      let rel = '';
      try {
        rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
      } catch {
        rel = '';
      }
      if (rel && !rel.includes('\0')) {
        const filePath = path.normalize(path.join(webDist, rel));
        if (filePath.startsWith(webDist)) {
          try {
            if (fs.statSync(filePath).isFile()) {
              const ext = path.extname(filePath).toLowerCase();
              reply.header('content-type', MIME[ext] ?? 'application/octet-stream');
              if (rel.startsWith('assets/')) reply.header('cache-control', 'public, max-age=31536000, immutable');
              return reply.send(fs.readFileSync(filePath));
            }
          } catch {
            /* fall through to index.html */
          }
        }
      }
      reply.header('cache-control', 'no-cache');
      return reply.type('text/html; charset=utf-8').send(fs.readFileSync(path.join(webDist, 'index.html')));
    });
  }

  return { app, ctx };
}
