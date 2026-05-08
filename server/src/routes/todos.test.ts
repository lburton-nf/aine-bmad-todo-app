import { test, expect } from 'vitest';
import { buildServer } from '../server';
import { initialize, type Db } from '../db';

const U1 = 'anon-11111111-1111-1111-1111-111111111111';
const U2 = 'anon-22222222-2222-2222-2222-222222222222';
const ID1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const ID2 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
const ID3 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';

async function makeApp(seed?: (db: Db) => void) {
  const db = initialize(':memory:');
  if (seed) seed(db);
  return buildServer({ corsOrigin: '', logger: false, db });
}

test('GET /todos with empty DB returns 200 + []', async () => {
  const app = await makeApp();
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/todos',
      headers: { 'x-user-id': U1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  } finally {
    await app.close();
  }
});

test('GET /todos returns rows newest-first with the canonical Todo shape (no user_id)', async () => {
  const app = await makeApp((db) => {
    db.createTodo(U1, { id: ID1, description: 'first' });
    // Force a measurable gap so created_at sorts deterministically.
    const before = Date.now();
    while (Date.now() === before) {
      /* spin */
    }
    db.createTodo(U1, { id: ID2, description: 'second' });
  });
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/todos',
      headers: { 'x-user-id': U1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<Record<string, unknown>>;
    expect(body.map((r) => r.description)).toEqual(['second', 'first']);
    body.forEach((row) => {
      expect(Object.keys(row).sort()).toEqual(['completed', 'created_at', 'description', 'id']);
      expect(row).not.toHaveProperty('user_id');
    });
  } finally {
    await app.close();
  }
});

test("GET /todos enforces cross-user isolation (only the caller's rows)", async () => {
  const app = await makeApp((db) => {
    db.createTodo(U1, { id: ID1, description: 'u1-a' });
    db.createTodo(U2, { id: ID2, description: 'u2-a' });
    db.createTodo(U1, { id: ID3, description: 'u1-b' });
  });
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/todos',
      headers: { 'x-user-id': U1 },
    });
    expect(res.statusCode).toBe(200);
    const descriptions = (res.json() as Array<{ description: string }>).map((r) => r.description);
    expect(descriptions.sort()).toEqual(['u1-a', 'u1-b']);
  } finally {
    await app.close();
  }
});

test('GET /todos with no X-User-Id returns 400 with the default envelope', async () => {
  const app = await makeApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/todos' });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { statusCode: number; error: string; message: string };
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(typeof body.message).toBe('string');
  } finally {
    await app.close();
  }
});

test('GET /todos with malformed X-User-Id returns 400', async () => {
  const app = await makeApp();
  try {
    const malformed = [
      '', // empty string — separate code path from "missing"
      'not-an-anon',
      'anon-abc',
      'anon-XX111111-1111-1111-1111-111111111111',
      'anon-11111111-1111-1111-1111-1111111111111', // 37 chars after prefix
    ];
    for (const bad of malformed) {
      const res = await app.inject({
        method: 'GET',
        url: '/todos',
        headers: { 'x-user-id': bad },
      });
      expect(res.statusCode, `for input "${bad}"`).toBe(400);
    }
  } finally {
    await app.close();
  }
});

test('GET /todos with duplicate X-User-Id headers returns 400', async () => {
  // Node/Fastify combines duplicate header sends into a comma-separated
  // string before the handler sees it, so the regex naturally rejects.
  // This test guards against that transport behaviour changing.
  const app = await makeApp();
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/todos',
      headers: { 'x-user-id': [U1, U2] },
    });
    expect(res.statusCode).toBe(400);
  } finally {
    await app.close();
  }
});

test('NFR-5: 400 response does NOT echo the bad X-User-Id value', async () => {
  const app = await makeApp();
  try {
    const sensitive = 'anon-leaked-secret-value-not-a-real-uuid';
    const res = await app.inject({
      method: 'GET',
      url: '/todos',
      headers: { 'x-user-id': sensitive },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain(sensitive);
  } finally {
    await app.close();
  }
});
