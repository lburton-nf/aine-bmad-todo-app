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

test('2KB JSON body returns 413 (1 KB bodyLimit invariant)', async () => {
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

test('unknown path returns 404 with the default JSON envelope (no SPA fallback)', async () => {
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

test('responses set browser-defence headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)', async () => {
  const app = await makeApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    const csp = res.headers['content-security-policy'];
    expect(typeof csp).toBe('string');
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toMatch(/DENY|SAMEORIGIN/i);
    expect(typeof res.headers['referrer-policy']).toBe('string');
  } finally {
    await app.close();
  }
});

test('CORS preflight advertises PATCH and DELETE in Allow-Methods', async () => {
  const app = await buildServer({
    corsOrigin: 'http://example.test',
    logger: false,
    db: initialize(':memory:'),
  });
  try {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/todos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      headers: {
        origin: 'http://example.test',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'content-type, x-user-id',
      },
    });
    expect(res.statusCode).toBe(204);
    const allowMethods = res.headers['access-control-allow-methods'];
    expect(allowMethods).toMatch(/PATCH/);
    expect(allowMethods).toMatch(/DELETE/);
    expect(res.headers['access-control-allow-origin']).toBe('http://example.test');
  } finally {
    await app.close();
  }
});
