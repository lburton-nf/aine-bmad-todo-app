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
      // Mo4: 36 hex chars but no dashes — the old loose regex
      // /^anon-[0-9a-f-]{36}$/ accepted this; the canonical 8-4-4-4-12
      // shape rejects it.
      'anon-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
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

// ───────────────────────────────────────────────────────────────────
// POST /todos
// ───────────────────────────────────────────────────────────────────

async function postTodo(app: Awaited<ReturnType<typeof makeApp>>, userId: string, body: unknown) {
  return app.inject({
    method: 'POST',
    url: '/todos',
    headers: { 'x-user-id': userId, 'content-type': 'application/json' },
    payload: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('POST /todos happy path: 201 + Todo shape with completed:false and created_at near now', async () => {
  const app = await makeApp();
  try {
    const before = Date.now();
    const res = await postTodo(app, U1, { id: ID1, description: 'buy bread' });
    const after = Date.now();
    expect(res.statusCode).toBe(201);
    const body = res.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['completed', 'created_at', 'description', 'id']);
    expect(body).not.toHaveProperty('user_id');
    expect(body.id).toBe(ID1);
    expect(body.description).toBe('buy bread');
    expect(body.completed).toBe(false);
    expect(body.created_at).toBeGreaterThanOrEqual(before);
    expect(body.created_at).toBeLessThanOrEqual(after);
  } finally {
    await app.close();
  }
});

test('POST then GET round-trips, with cross-user isolation through HTTP (NFR-1)', async () => {
  const app = await makeApp();
  try {
    expect((await postTodo(app, U1, { id: ID1, description: 'u1-a' })).statusCode).toBe(201);
    expect((await postTodo(app, U2, { id: ID2, description: 'u2-a' })).statusCode).toBe(201);
    expect((await postTodo(app, U1, { id: ID3, description: 'u1-b' })).statusCode).toBe(201);

    const u1Res = await app.inject({
      method: 'GET',
      url: '/todos',
      headers: { 'x-user-id': U1 },
    });
    const u2Res = await app.inject({
      method: 'GET',
      url: '/todos',
      headers: { 'x-user-id': U2 },
    });
    expect(u1Res.statusCode).toBe(200);
    expect(u2Res.statusCode).toBe(200);
    const u1Descriptions = (u1Res.json() as Array<{ description: string }>)
      .map((r) => r.description)
      .sort();
    const u2Descriptions = (u2Res.json() as Array<{ description: string }>)
      .map((r) => r.description)
      .sort();
    expect(u1Descriptions).toEqual(['u1-a', 'u1-b']);
    expect(u2Descriptions).toEqual(['u2-a']);
  } finally {
    await app.close();
  }
});

test('POST /todos with duplicate id (same user) returns 400 with default envelope', async () => {
  const app = await makeApp();
  try {
    expect((await postTodo(app, U1, { id: ID1, description: 'first' })).statusCode).toBe(201);
    const res = await postTodo(app, U1, { id: ID1, description: 'retry' });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { statusCode: number; error: string; message: string };
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(body.message).toMatch(/already exists/i);
  } finally {
    await app.close();
  }
});

test('AI-3 unification: duplicate id from a DIFFERENT user returns 400 (no ownership leak)', async () => {
  const app = await makeApp();
  try {
    expect((await postTodo(app, U1, { id: ID1, description: 'u1 owns this' })).statusCode).toBe(
      201,
    );
    const res = await postTodo(app, U2, { id: ID1, description: 'u2 trying same id' });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { message: string };
    expect(body.message).toMatch(/already exists/i);
    // The response must NOT distinguish "owned by another user" from a same-user retry.
    expect(body.message).not.toMatch(/owner|other user|forbidden/i);
  } finally {
    await app.close();
  }
});

test('POST /todos rejects bad descriptions (empty, whitespace-only, > 280 chars trimmed)', async () => {
  const app = await makeApp();
  try {
    const cases: Array<{ id: string; description: string }> = [
      { id: ID1, description: '' },
      { id: ID2, description: '   ' },
      { id: ID3, description: 'x'.repeat(281) },
    ];
    for (const body of cases) {
      const res = await postTodo(app, U1, body);
      expect(res.statusCode, `for description="${body.description.slice(0, 10)}…"`).toBe(400);
    }
    // Boundary: exactly 280 chars succeeds.
    const okRes = await postTodo(app, U1, { id: ID1, description: 'y'.repeat(280) });
    expect(okRes.statusCode).toBe(201);
  } finally {
    await app.close();
  }
});

test('Mo7: POST /todos trims leading/trailing whitespace before storing the description', async () => {
  const app = await makeApp();
  try {
    const res = await postTodo(app, U1, { id: ID1, description: '  buy bread  ' });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { description: string };
    expect(body.description).toBe('buy bread');
  } finally {
    await app.close();
  }
});

test('Mi9: POST /todos counts trimmed length, not raw, against the 280 limit', async () => {
  const app = await makeApp();
  try {
    // 280 meaningful chars wrapped in 4 chars of whitespace: trimmed = 280, accepted.
    const padded = '  ' + 'y'.repeat(280) + '  ';
    expect(padded.length).toBe(284);
    const res = await postTodo(app, U1, { id: ID1, description: padded });
    expect(res.statusCode).toBe(201);
    // 281 meaningful chars wrapped in whitespace: trimmed = 281, rejected.
    const overPadded = '  ' + 'z'.repeat(281) + '  ';
    const overRes = await postTodo(app, U1, { id: ID2, description: overPadded });
    expect(overRes.statusCode).toBe(400);
  } finally {
    await app.close();
  }
});

test('Mi3: POST /todos counts graphemes, not UTF-16 code units (mixed text + emoji)', async () => {
  // FR26 bodyLimit (1 KB) is the binding constraint for pure-emoji payloads
  // — 280 emoji at 4 UTF-8 bytes apiece is ~1.1 KB, rejected at the parser
  // before the validator runs. So we exercise grapheme counting via mixed
  // text+emoji payloads that comfortably fit under 1 KB but would have been
  // rejected by the old `description.length` (UTF-16 code units) check.
  const app = await makeApp();
  try {
    // 200 ASCII + 80 party-poppers = 280 graphemes.
    // UTF-16 length = 200 + 160 = 360 — would be rejected by the OLD
    // .length-based check. UTF-8 bytes = 200 + 320 = 520, under bodyLimit.
    const mixed280 = 'a'.repeat(200) + '🎉'.repeat(80);
    expect(mixed280.length).toBe(360);
    const res = await postTodo(app, U1, { id: ID1, description: mixed280 });
    expect(res.statusCode).toBe(201);

    // 281st grapheme tips it over.
    const mixed281 = 'a'.repeat(200) + '🎉'.repeat(81);
    const overRes = await postTodo(app, U1, { id: ID2, description: mixed281 });
    expect(overRes.statusCode).toBe(400);

    // Multi-codepoint grapheme cluster: a regional-indicator flag is two
    // codepoints (= one grapheme). 270 ASCII + 10 flags = 280 graphemes;
    // UTF-16 length = 310 — old check would reject it. UTF-8 bytes = 350.
    const flagsAndText = 'b'.repeat(270) + '🇬🇧'.repeat(10);
    const flagRes = await postTodo(app, U1, { id: ID3, description: flagsAndText });
    expect(flagRes.statusCode).toBe(201);
  } finally {
    await app.close();
  }
});

test('POST /todos rejects bad ids (not a UUID, uppercase, missing)', async () => {
  const app = await makeApp();
  try {
    const cases: unknown[] = [
      { id: 'not-a-uuid', description: 'task' },
      { id: 'AAAAAAAA-aaaa-aaaa-aaaa-aaaaaaaaaaaa', description: 'task' }, // uppercase
      { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa', description: 'task' }, // 35 chars in last
      { description: 'task' }, // no id
    ];
    for (const body of cases) {
      const res = await postTodo(app, U1, body);
      expect(res.statusCode).toBe(400);
    }
  } finally {
    await app.close();
  }
});

test('POST /todos with JSON array body returns 400 with the JSON-object message', async () => {
  const app = await makeApp();
  try {
    const res = await postTodo(app, U1, [{ id: ID1, description: 'task' }]);
    expect(res.statusCode).toBe(400);
    const body = res.json() as { message: string };
    expect(body.message).toMatch(/JSON object/i);
    expect(body.message).not.toMatch(/UUID/i);
  } finally {
    await app.close();
  }
});

test('POST /todos with no body / non-JSON returns 400', async () => {
  const app = await makeApp();
  try {
    // No body at all
    const noBody = await app.inject({
      method: 'POST',
      url: '/todos',
      headers: { 'x-user-id': U1, 'content-type': 'application/json' },
    });
    expect(noBody.statusCode).toBe(400);

    // Empty string body
    const emptyBody = await postTodo(app, U1, '');
    expect(emptyBody.statusCode).toBe(400);

    // Non-object JSON (string)
    const stringBody = await postTodo(app, U1, '"just a string"');
    expect(stringBody.statusCode).toBe(400);
  } finally {
    await app.close();
  }
});

test('POST /todos with missing X-User-Id returns 400 (auth check runs before body validation)', async () => {
  const app = await makeApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/todos',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ id: ID1, description: 'task' }),
    });
    expect(res.statusCode).toBe(400);
  } finally {
    await app.close();
  }
});

// ───────────────────────────────────────────────────────────────────
// PATCH /todos/:id
// ───────────────────────────────────────────────────────────────────

async function patchTodo(
  app: Awaited<ReturnType<typeof makeApp>>,
  userId: string,
  id: string,
  body: unknown,
) {
  return app.inject({
    method: 'PATCH',
    url: `/todos/${id}`,
    headers: { 'x-user-id': userId, 'content-type': 'application/json' },
    payload: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('PATCH /todos/:id flips completed and returns 200 + updated Todo', async () => {
  const app = await makeApp((db) => {
    db.createTodo(U1, { id: ID1, description: 'task' });
  });
  try {
    const res = await patchTodo(app, U1, ID1, { completed: true });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; completed: boolean };
    expect(body.id).toBe(ID1);
    expect(body.completed).toBe(true);
  } finally {
    await app.close();
  }
});

test('AI-3: PATCH on cross-user :id returns 404 (no ownership leak)', async () => {
  const app = await makeApp((db) => {
    db.createTodo(U2, { id: ID1, description: 'u2 task' });
  });
  try {
    const res = await patchTodo(app, U1, ID1, { completed: true });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { statusCode: number; error: string; message: string };
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe('Not Found');
    // U2's row is untouched.
    const u2GetRes = await app.inject({
      method: 'GET',
      url: '/todos',
      headers: { 'x-user-id': U2 },
    });
    expect((u2GetRes.json() as Array<{ completed: boolean }>)[0].completed).toBe(false);
  } finally {
    await app.close();
  }
});

test('AI-3: PATCH on non-existent :id returns 404 (same envelope as cross-user)', async () => {
  const app = await makeApp();
  try {
    const res = await patchTodo(app, U1, ID1, { completed: true });
    expect(res.statusCode).toBe(404);
  } finally {
    await app.close();
  }
});

test('PATCH /todos/:id rejects bad bodies (missing/empty/wrong type/extra fields)', async () => {
  const app = await makeApp((db) => {
    db.createTodo(U1, { id: ID1, description: 'task' });
  });
  try {
    const cases: unknown[] = [
      {},
      { completed: 'yes' },
      { completed: 1 },
      { completed: true, description: 'sneaky' },
      [],
      'not an object',
    ];
    for (const body of cases) {
      const res = await patchTodo(app, U1, ID1, body);
      expect(res.statusCode).toBe(400);
    }
  } finally {
    await app.close();
  }
});

test('PATCH /todos/:id with bad :id format returns 400 (before DB call)', async () => {
  const app = await makeApp();
  try {
    const res = await patchTodo(app, U1, 'not-a-uuid', { completed: true });
    expect(res.statusCode).toBe(400);
  } finally {
    await app.close();
  }
});

// ───────────────────────────────────────────────────────────────────
// DELETE /todos/:id
// ───────────────────────────────────────────────────────────────────

test('DELETE /todos/:id removes the row and returns 204', async () => {
  const app = await makeApp((db) => {
    db.createTodo(U1, { id: ID1, description: 'task' });
  });
  try {
    const res = await app.inject({
      method: 'DELETE',
      url: `/todos/${ID1}`,
      headers: { 'x-user-id': U1 },
    });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    // Row is gone.
    const getRes = await app.inject({
      method: 'GET',
      url: '/todos',
      headers: { 'x-user-id': U1 },
    });
    expect(getRes.json()).toEqual([]);
  } finally {
    await app.close();
  }
});

test('AI-3: DELETE on cross-user :id returns 404 and leaves row intact', async () => {
  const app = await makeApp((db) => {
    db.createTodo(U2, { id: ID1, description: 'u2 task' });
  });
  try {
    const res = await app.inject({
      method: 'DELETE',
      url: `/todos/${ID1}`,
      headers: { 'x-user-id': U1 },
    });
    expect(res.statusCode).toBe(404);
    const u2GetRes = await app.inject({
      method: 'GET',
      url: '/todos',
      headers: { 'x-user-id': U2 },
    });
    expect((u2GetRes.json() as unknown[]).length).toBe(1);
  } finally {
    await app.close();
  }
});

test('AI-3: DELETE on non-existent :id returns 404 (same envelope as cross-user)', async () => {
  const app = await makeApp();
  try {
    const res = await app.inject({
      method: 'DELETE',
      url: `/todos/${ID1}`,
      headers: { 'x-user-id': U1 },
    });
    expect(res.statusCode).toBe(404);
  } finally {
    await app.close();
  }
});

// ───────────────────────────────────────────────────────────────────
// DELETE /todos (bulk delete-mine)
// ───────────────────────────────────────────────────────────────────

test("DELETE /todos clears the caller's rows and returns 204", async () => {
  const app = await makeApp((db) => {
    db.createTodo(U1, { id: ID1, description: 'a' });
    db.createTodo(U1, { id: ID2, description: 'b' });
  });
  try {
    const res = await app.inject({
      method: 'DELETE',
      url: '/todos',
      headers: { 'x-user-id': U1 },
    });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    const getRes = await app.inject({
      method: 'GET',
      url: '/todos',
      headers: { 'x-user-id': U1 },
    });
    expect(getRes.json()).toEqual([]);
  } finally {
    await app.close();
  }
});

test('DELETE /todos with no rows for caller still returns 204 (empty bulk = success)', async () => {
  const app = await makeApp();
  try {
    const res = await app.inject({
      method: 'DELETE',
      url: '/todos',
      headers: { 'x-user-id': U1 },
    });
    expect(res.statusCode).toBe(204);
  } finally {
    await app.close();
  }
});

test("DELETE /todos preserves OTHER users' rows (cross-user isolation)", async () => {
  const app = await makeApp((db) => {
    db.createTodo(U1, { id: ID1, description: 'u1-a' });
    db.createTodo(U1, { id: ID2, description: 'u1-b' });
    db.createTodo(U2, { id: ID3, description: 'u2-survives' });
  });
  try {
    const delRes = await app.inject({
      method: 'DELETE',
      url: '/todos',
      headers: { 'x-user-id': U1 },
    });
    expect(delRes.statusCode).toBe(204);
    const u2GetRes = await app.inject({
      method: 'GET',
      url: '/todos',
      headers: { 'x-user-id': U2 },
    });
    const u2Rows = u2GetRes.json() as Array<{ description: string }>;
    expect(u2Rows.map((r) => r.description)).toEqual(['u2-survives']);
  } finally {
    await app.close();
  }
});
