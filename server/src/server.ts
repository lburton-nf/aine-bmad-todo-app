// Test-friendly Fastify factory. No .listen() here — index.ts owns lifecycle.

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { HealthResponse } from '../../shared/types';
import type { Db } from './db';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export interface BuildServerOpts {
  corsOrigin: string;
  db: Db;
  /** Pass `false` in tests to silence Pino. Pass an object to override defaults. */
  logger?: boolean | object;
}

// Read by `npm run dev` and `npm start`. Direct `node dist/...` invocations
// fall back to "0.0.0.0" — should not happen in v1 (Docker uses npm start).
const VERSION = process.env.npm_package_version ?? '0.0.0';

export async function buildServer(opts: BuildServerOpts): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 1024,
    logger: opts.logger ?? {
      // NFR-5: scrub X-User-Id from every log line.
      redact: ['req.headers["x-user-id"]'],
    },
  });

  app.decorate('db', opts.db);
  app.addHook('onClose', async (instance) => {
    instance.db.close();
  });

  await app.register(cors, {
    // Empty string => no CORS allow-list (same-origin / tests). @fastify/cors
    // rejects empty strings, so we coerce to `false`. Any configured value
    // is passed through verbatim.
    origin: opts.corsOrigin || false,
    allowedHeaders: ['Content-Type', 'X-User-Id'],
  });

  app.get('/healthz', async (): Promise<HealthResponse> => {
    return { ok: true, version: VERSION };
  });

  return app;
}
