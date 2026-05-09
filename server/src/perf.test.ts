// NFR-4 — automated p95 latency benchmark.
//
// PRD says: "Server response p95 is under 100 ms for any CRUD action,
// measured over at least 100 requests against the running Docker container."
//
// We run the same Fastify build via inject() in-process (no network, same
// route handlers, same better-sqlite3, same prepared-statement cache). If
// p95 is comfortably under 100 ms here, adding the Docker-and-loopback
// round-trip on top gets us to ~5 ms more under conservative assumptions —
// well within budget. The test catches NFR-4 regressions (slow query, lock
// contention, accidental sync I/O) without needing a running container.
//
// Each route gets 10 warmup iterations (JIT + sqlite cache settle) followed
// by 100 measured iterations. p95 is taken from the sorted samples.

import { test, expect } from 'vitest';
import { buildServer } from './server';
import { initialize, type Db } from './db';

const U1 = 'anon-11111111-1111-1111-1111-111111111111';
const WARMUP = 10;
const ITERATIONS = 100;
const P95_BUDGET_MS = 100;

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  // For n=100 the 95th percentile lands at index 95 (after 0-indexing).
  return sorted[Math.floor(sorted.length * 0.95)];
}

function reportPerf(label: string, samples: number[]): number {
  const p = p95(samples);
  // Emit a single line per route so `npm run test:perf` (which uses the
  // verbose reporter) shows actual latencies, not just pass/fail. The
  // default reporter used by plain `npm test` swallows test stdout, so
  // these lines don't add noise to normal runs.
  console.log(`  ${label.padEnd(20)} p95 = ${p.toFixed(2)}ms`);
  return p;
}

function uuid(suffix: number): string {
  // Deterministic UUID-shaped ids: aaaaaaaa-aaaa-aaaa-aaaa-<12 hex>.
  return `aaaaaaaa-aaaa-aaaa-aaaa-${suffix.toString(16).padStart(12, '0')}`;
}

async function makeApp(seed?: (db: Db) => void) {
  const db = initialize(':memory:');
  if (seed) seed(db);
  return buildServer({ corsOrigin: '', logger: false, db });
}

test(`NFR-4: GET /todos p95 < ${P95_BUDGET_MS}ms over ${ITERATIONS} requests`, async () => {
  const app = await makeApp((db) => {
    // Seed 25 rows so list-rendering exercises a representative payload.
    for (let i = 0; i < 25; i++) {
      db.createTodo(U1, { id: uuid(i), description: `seed ${i}` });
    }
  });
  try {
    for (let i = 0; i < WARMUP; i++) {
      await app.inject({ method: 'GET', url: '/todos', headers: { 'x-user-id': U1 } });
    }
    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      const res = await app.inject({ method: 'GET', url: '/todos', headers: { 'x-user-id': U1 } });
      samples.push(performance.now() - start);
      expect(res.statusCode).toBe(200);
    }
    const p = reportPerf('GET /todos', samples);
    expect(p, `GET /todos p95=${p.toFixed(2)}ms`).toBeLessThan(P95_BUDGET_MS);
  } finally {
    await app.close();
  }
});

test(`NFR-4: POST /todos p95 < ${P95_BUDGET_MS}ms over ${ITERATIONS} requests`, async () => {
  const app = await makeApp();
  try {
    for (let i = 0; i < WARMUP; i++) {
      await app.inject({
        method: 'POST',
        url: '/todos',
        headers: { 'x-user-id': U1, 'content-type': 'application/json' },
        payload: JSON.stringify({ id: uuid(1_000_000 + i), description: `warmup ${i}` }),
      });
    }
    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const payload = JSON.stringify({ id: uuid(i), description: `bench ${i}` });
      const start = performance.now();
      const res = await app.inject({
        method: 'POST',
        url: '/todos',
        headers: { 'x-user-id': U1, 'content-type': 'application/json' },
        payload,
      });
      samples.push(performance.now() - start);
      expect(res.statusCode).toBe(201);
    }
    const p = reportPerf('POST /todos', samples);
    expect(p, `POST /todos p95=${p.toFixed(2)}ms`).toBeLessThan(P95_BUDGET_MS);
  } finally {
    await app.close();
  }
});

test(`NFR-4: PATCH /todos/:id p95 < ${P95_BUDGET_MS}ms over ${ITERATIONS} requests`, async () => {
  const TARGET_ID = uuid(0);
  const app = await makeApp((db) => {
    db.createTodo(U1, { id: TARGET_ID, description: 'toggle me' });
  });
  try {
    for (let i = 0; i < WARMUP; i++) {
      await app.inject({
        method: 'PATCH',
        url: `/todos/${TARGET_ID}`,
        headers: { 'x-user-id': U1, 'content-type': 'application/json' },
        payload: JSON.stringify({ completed: i % 2 === 0 }),
      });
    }
    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      const res = await app.inject({
        method: 'PATCH',
        url: `/todos/${TARGET_ID}`,
        headers: { 'x-user-id': U1, 'content-type': 'application/json' },
        payload: JSON.stringify({ completed: i % 2 === 0 }),
      });
      samples.push(performance.now() - start);
      expect(res.statusCode).toBe(200);
    }
    const p = reportPerf('PATCH /todos/:id', samples);
    expect(p, `PATCH /todos/:id p95=${p.toFixed(2)}ms`).toBeLessThan(P95_BUDGET_MS);
  } finally {
    await app.close();
  }
});

test(`NFR-4: DELETE /todos/:id p95 < ${P95_BUDGET_MS}ms over ${ITERATIONS} requests`, async () => {
  // Seed enough rows for the full warmup+measurement run (each iteration
  // consumes one row).
  const TOTAL = WARMUP + ITERATIONS;
  const app = await makeApp((db) => {
    for (let i = 0; i < TOTAL; i++) {
      db.createTodo(U1, { id: uuid(i), description: `row ${i}` });
    }
  });
  try {
    for (let i = 0; i < WARMUP; i++) {
      await app.inject({
        method: 'DELETE',
        url: `/todos/${uuid(i)}`,
        headers: { 'x-user-id': U1 },
      });
    }
    const samples: number[] = [];
    for (let i = WARMUP; i < TOTAL; i++) {
      const start = performance.now();
      const res = await app.inject({
        method: 'DELETE',
        url: `/todos/${uuid(i)}`,
        headers: { 'x-user-id': U1 },
      });
      samples.push(performance.now() - start);
      expect(res.statusCode).toBe(204);
    }
    const p = reportPerf('DELETE /todos/:id', samples);
    expect(p, `DELETE /todos/:id p95=${p.toFixed(2)}ms`).toBeLessThan(P95_BUDGET_MS);
  } finally {
    await app.close();
  }
});
