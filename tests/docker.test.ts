// Docker integration test — proves NFR-6 (data persists across `docker rm` +
// `docker run` against the same volume). Skips itself when Docker isn't
// available so non-Docker CI runs don't fail.
//
// Manual prerequisite: `docker build -t todo-app-3 .` from the repo root.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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

async function waitForHealthz(maxMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`http://localhost:${TEST_PORT}/healthz`);
      if (res.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Container did not become healthy within ${maxMs}ms`);
}

function dockerRm() {
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
}

const skip = !dockerAvailable() || !imageExists();

describe.skipIf(skip)('docker integration', () => {
  let dataDir: string;

  beforeAll(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'todo-app-3-data-'));
  });

  afterAll(() => {
    dockerRm();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  test('persists data across container removal', async () => {
    const U = 'anon-11111111-1111-1111-1111-111111111111';
    const ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';

    // First container: create a todo, then remove the container.
    dockerRm();
    spawnSync(
      'docker',
      [
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
      ],
      { stdio: 'ignore' },
    );
    await waitForHealthz();

    const postRes = await fetch(`http://localhost:${TEST_PORT}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': U },
      body: JSON.stringify({ id: ID, description: 'persisted across restart' }),
    });
    expect(postRes.status).toBe(201);

    dockerRm();

    // Second container, SAME volume.
    spawnSync(
      'docker',
      [
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
      ],
      { stdio: 'ignore' },
    );
    await waitForHealthz();

    const getRes = await fetch(`http://localhost:${TEST_PORT}/todos`, {
      headers: { 'X-User-Id': U },
    });
    expect(getRes.status).toBe(200);
    const rows = (await getRes.json()) as Array<{ id: string; description: string }>;
    expect(rows.map((r) => r.id)).toEqual([ID]);
    expect(rows[0].description).toBe('persisted across restart');
  }, 60_000);
});

if (skip) {
  test.skip('docker integration (Docker not available or image not built)', () => {});
}
