import { test, expect } from 'vitest';
import { buildServer } from './server';
import { initialize } from './db';

async function makeApp() {
  return buildServer({ corsOrigin: '', logger: false, db: initialize(':memory:') });
}

// Test-only echo route used to exercise bodyLimit. Fastify's body parsing
// runs after route resolution, so we need a registered POST endpoint to
// verify the 413 path under load.
async function makeAppWithEcho() {
  const app = await buildServer({
    corsOrigin: '',
    logger: false,
    db: initialize(':memory:'),
  });
  app.post('/__test-echo', async (req) => req.body);
  return app;
}

test('GET /healthz returns 200 with HealthResponse shape', async () => {
  const app = await makeApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe('string');
  } finally {
    await app.close();
  }
});

test('AI-1: 2KB JSON body returns 413 (bodyLimit invariant)', async () => {
  const app = await makeAppWithEcho();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/__test-echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ pad: 'x'.repeat(2048) }),
    });
    expect(res.statusCode).toBe(413);
  } finally {
    await app.close();
  }
});

test('AI-2: unknown path returns 404 with default JSON envelope (no SPA fallback)', async () => {
  const app = await makeApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = res.json() as { statusCode: number; error: string; message: string };
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe('Not Found');
    expect(typeof body.message).toBe('string');
  } finally {
    await app.close();
  }
});
