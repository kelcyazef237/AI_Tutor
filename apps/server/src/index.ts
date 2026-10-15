import { buildApp } from './app';
import { config } from './config';
import { refreshAIStatus } from './routes/ai';

const { app, ctx } = await buildApp({
  dataDir: config.dataDir,
  webDist: config.webDist,
  corsOrigins: config.corsOrigins,
  logger: { level: config.logLevel, transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } },
});

await app.listen({ host: config.host, port: config.port });
app.log.info(`Profiles under: ${config.dataDir}  (active: ${ctx.profiles.activeId()})`);
if (config.webDist) app.log.info(`Frontend dist: ${config.webDist}`);
await refreshAIStatus(ctx);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    ctx.profiles.close();
    process.exit(0);
  });
}
