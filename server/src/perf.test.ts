// p95 latency benchmark: budget 100 ms per CRUD route. Runs in-process via
// Fastify inject() — same handlers, same SQLite, no network — so a regression
// (slow query, lock contention, accidental sync I/O) shows up here without
// needing the container. Each route warms 10 iterations then measures 100.

import { test, expect } from 'vitest';
import { buildServer } from './server';
import { initialize, type Db } from './db';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';

const U1 = 'anon-11111111-1111-1111-1111-111111111111';
const WARMUP = 10;
const ITERATIONS = 100;
const P95_BUDGET_MS = 100;

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)];
}

function reportPerf(label: string, samples: number[]): number {
  const p = p95(samples);
  // `npm run test:perf` (verbose reporter) shows these lines; the default
  // reporter used by plain `npm test` swallows them, so no normal-run noise.
  console.log(`  ${label.padEnd(20)} p95 = ${p.toFixed(2)}ms`);
  return p;
}

function uuid(suffix: number): string {
  return `aaaaaaaa-aaaa-aaaa-aaaa-${suffix.toString(16).padStart(12, '0')}`;
}

async function makeApp(seed?: (db: Db) => void) {
  const db = initialize(':memory:');
  if (seed) seed(db);
  return buildServer({ corsOrigin: '', logger: false, db });
}

type App = Awaited<ReturnType<typeof makeApp>>;

interface BenchmarkOpts {
  app: App;
  label: string;
  expectedStatus: number;
  /** Receives a 0-based iteration index spanning warmup (0..WARMUP-1) and
      measurement (WARMUP..WARMUP+ITERATIONS-1). Tests can use this to derive
      unique payload ids per iteration without colliding across phases. */
  request: (i: number) => InjectOptions;
}

async function benchmarkRoute(opts: BenchmarkOpts): Promise<number> {
  const inject = async (i: number): Promise<LightMyRequestResponse> =>
    opts.app.inject(opts.request(i));

  for (let i = 0; i < WARMUP; i++) await inject(i);

  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    const res = await inject(WARMUP + i);
    samples.push(performance.now() - start);
    expect(res.statusCode).toBe(opts.expectedStatus);
  }
  return reportPerf(opts.label, samples);
}

test(`GET /todos p95 stays under ${P95_BUDGET_MS}ms over ${ITERATIONS} requests`, async () => {
  const app = await makeApp((db) => {
    for (let i = 0; i < 25; i++) {
      db.createTodo(U1, { id: uuid(i), description: `seed ${i}` });
    }
  });
  try {
    const p = await benchmarkRoute({
      app,
      label: 'GET /todos',
      expectedStatus: 200,
      request: () => ({ method: 'GET', url: '/todos', headers: { 'x-user-id': U1 } }),
    });
    expect(p, `GET /todos p95=${p.toFixed(2)}ms`).toBeLessThan(P95_BUDGET_MS);
  } finally {
    await app.close();
  }
});

test(`POST /todos p95 stays under ${P95_BUDGET_MS}ms over ${ITERATIONS} requests`, async () => {
  const app = await makeApp();
  try {
    const p = await benchmarkRoute({
      app,
      label: 'POST /todos',
      expectedStatus: 201,
      request: (i) => ({
        method: 'POST',
        url: '/todos',
        headers: { 'x-user-id': U1, 'content-type': 'application/json' },
        payload: JSON.stringify({ id: uuid(i), description: `bench ${i}` }),
      }),
    });
    expect(p, `POST /todos p95=${p.toFixed(2)}ms`).toBeLessThan(P95_BUDGET_MS);
  } finally {
    await app.close();
  }
});

test(`PATCH /todos/:id p95 stays under ${P95_BUDGET_MS}ms over ${ITERATIONS} requests`, async () => {
  const TARGET_ID = uuid(0);
  const app = await makeApp((db) => {
    db.createTodo(U1, { id: TARGET_ID, description: 'toggle me' });
  });
  try {
    const p = await benchmarkRoute({
      app,
      label: 'PATCH /todos/:id',
      expectedStatus: 200,
      request: (i) => ({
        method: 'PATCH',
        url: `/todos/${TARGET_ID}`,
        headers: { 'x-user-id': U1, 'content-type': 'application/json' },
        payload: JSON.stringify({ completed: i % 2 === 0 }),
      }),
    });
    expect(p, `PATCH /todos/:id p95=${p.toFixed(2)}ms`).toBeLessThan(P95_BUDGET_MS);
  } finally {
    await app.close();
  }
});

test(`DELETE /todos/:id p95 stays under ${P95_BUDGET_MS}ms over ${ITERATIONS} requests`, async () => {
  // Each iteration consumes one row; seed enough for warmup + measurement.
  const TOTAL = WARMUP + ITERATIONS;
  const app = await makeApp((db) => {
    for (let i = 0; i < TOTAL; i++) {
      db.createTodo(U1, { id: uuid(i), description: `row ${i}` });
    }
  });
  try {
    const p = await benchmarkRoute({
      app,
      label: 'DELETE /todos/:id',
      expectedStatus: 204,
      request: (i) => ({
        method: 'DELETE',
        url: `/todos/${uuid(i)}`,
        headers: { 'x-user-id': U1 },
      }),
    });
    expect(p, `DELETE /todos/:id p95=${p.toFixed(2)}ms`).toBeLessThan(P95_BUDGET_MS);
  } finally {
    await app.close();
  }
});
