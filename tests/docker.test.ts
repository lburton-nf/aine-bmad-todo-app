// Docker integration test — proves NFR-6 (data persists across `docker rm` +
// `docker run` against the same volume). Skips itself when Docker isn't
// available so non-Docker CI runs don't fail.
//
// Manual prerequisite: `docker build -t todo-app-3 .` from the repo root.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const IMAGE = 'todo-app-3';
const TEST_PORT = '3099';
const CONTAINER = 'todo-app-3-integration';

function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function imageExists(): boolean {
  try {
    const out = execFileSync('docker', ['images', '-q', IMAGE], { encoding: 'utf8' });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

// Capture stderr + status; throw a useful error on non-zero exit. Without this,
// a failing `docker run` is invisible because stdio is dropped, and the test
// hangs in waitForHealthz for the entire timeout budget.
function runOrThrow(label: string, args: string[]) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (exit ${result.status ?? 'null'}):\n${result.stderr || '(no stderr)'}`,
    );
  }
}

async function waitForHealthz(maxMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      // Per-attempt timeout: without this, a hung connection (e.g. container
      // half-up: TCP-listening but HTTP-not-yet-accepting on a slow CI runner)
      // blocks the loop indefinitely, defeating the maxMs check.
      const res = await fetch(`http://localhost:${TEST_PORT}/healthz`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
    } catch {
      /* not ready yet — fall through to retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  // Capture the container's own logs so CI shows WHY the server didn't come
  // up (e.g. "EACCES: permission denied, open '/data/todos.db'").
  const logs = spawnSync('docker', ['logs', CONTAINER], { encoding: 'utf8' });
  throw new Error(
    `Container did not become healthy within ${maxMs}ms\n` +
      `--- container stdout ---\n${logs.stdout || '(empty)'}\n` +
      `--- container stderr ---\n${logs.stderr || '(empty)'}`,
  );
}

function dockerRm() {
  // Intentionally swallow stderr — `docker rm -f` of a non-existent container
  // returns non-zero, and the call site is idempotent cleanup.
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
}

const skip = !dockerAvailable() || !imageExists();

describe.skipIf(skip)('docker integration', () => {
  let dataDir: string;

  beforeAll(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'todo-app-3-data-'));
    // mkdtempSync creates 0o700 owned by the test process user. The container
    // runs as USER node (uid 1000); on Linux native dockerd those uids differ
    // from the runner user (uid 1001 on GitHub Actions ubuntu-latest), so the
    // container can't write to /data. Loosen perms — this is a tempdir scoped
    // to one test run.
    chmodSync(dataDir, 0o777);
  });

  afterAll(() => {
    dockerRm();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  test('persists data across container removal', async () => {
    const U = 'anon-11111111-1111-1111-1111-111111111111';
    const ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
    const runArgs = (): string[] => [
      'run',
      '-d',
      '--name',
      CONTAINER,
      '-p',
      `${TEST_PORT}:3000`,
      '-v',
      `${dataDir}:/data`,
      '-e',
      'CORS_ORIGIN=http://localhost:3000',
      IMAGE,
    ];

    // First container: create a todo, then remove the container.
    dockerRm();
    runOrThrow('docker run (first container)', runArgs());
    await waitForHealthz();

    const postRes = await fetch(`http://localhost:${TEST_PORT}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': U },
      body: JSON.stringify({ id: ID, description: 'persisted across restart' }),
      signal: AbortSignal.timeout(5000),
    });
    expect(postRes.status).toBe(201);

    dockerRm();

    // Second container, SAME volume.
    runOrThrow('docker run (second container)', runArgs());
    await waitForHealthz();

    const getRes = await fetch(`http://localhost:${TEST_PORT}/todos`, {
      headers: { 'X-User-Id': U },
      signal: AbortSignal.timeout(5000),
    });
    expect(getRes.status).toBe(200);
    const rows = (await getRes.json()) as Array<{ id: string; description: string }>;
    expect(rows.map((r) => r.id)).toEqual([ID]);
    expect(rows[0].description).toBe('persisted across restart');
  }, 120_000);
});

if (skip) {
  test.skip('docker integration (Docker not available or image not built)', () => {});
}
