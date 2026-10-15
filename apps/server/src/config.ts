import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const config = {
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(repoRoot, 'data', 'coach.db'),
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(repoRoot, 'data'),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  /** Built frontend to serve in production. WEB_DIST=false disables static serving (API-only / dev). */
  webDist: process.env.WEB_DIST === 'false' ? null : process.env.WEB_DIST ? path.resolve(process.env.WEB_DIST) : path.join(repoRoot, 'apps', 'web', 'dist'),
  /** Extra CORS origins (comma-separated) for LAN deployments, e.g. http://192.168.1.10:5173 */
  corsOrigins: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
