import { test, expect, beforeEach, afterEach, vi } from 'vitest';

// env.ts evaluates side-effectfully at module load. Each test resets the
// module registry, sets process.env, then dynamic-imports a fresh copy.

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function loadEnv() {
  const mod = await import('./env');
  return mod.env;
}

test('defaults: PORT=3000, DB_PATH=./data/todos.db, CORS_ORIGIN="", NODE_ENV=development', async () => {
  delete process.env.PORT;
  delete process.env.DB_PATH;
  delete process.env.CORS_ORIGIN;
  delete process.env.NODE_ENV;
  const env = await loadEnv();
  expect(env.PORT).toBe(3000);
  expect(env.DB_PATH).toBe('./data/todos.db');
  expect(env.CORS_ORIGIN).toBe('');
  expect(env.NODE_ENV).toBe('development');
});

test('rejects non-numeric PORT', async () => {
  process.env.PORT = 'abc';
  await expect(loadEnv()).rejects.toThrow(/PORT must be an integer/);
});

test('rejects out-of-range PORT', async () => {
  process.env.PORT = '99999';
  await expect(loadEnv()).rejects.toThrow(/PORT must be an integer/);
});

test('NODE_ENV=production with empty CORS_ORIGIN throws', async () => {
  process.env.NODE_ENV = 'production';
  process.env.CORS_ORIGIN = '';
  await expect(loadEnv()).rejects.toThrow(/CORS_ORIGIN.*required.*production/);
});

test('NODE_ENV=production with whitespace-only CORS_ORIGIN throws', async () => {
  process.env.NODE_ENV = 'production';
  process.env.CORS_ORIGIN = '   ';
  await expect(loadEnv()).rejects.toThrow(/CORS_ORIGIN.*required.*production/);
});

test('NODE_ENV=production with valid CORS_ORIGIN succeeds', async () => {
  process.env.NODE_ENV = 'production';
  process.env.CORS_ORIGIN = 'https://example.com';
  const env = await loadEnv();
  expect(env.NODE_ENV).toBe('production');
  expect(env.CORS_ORIGIN).toBe('https://example.com');
});

test('rejects unknown NODE_ENV value (no silent coercion)', async () => {
  process.env.NODE_ENV = 'staging';
  await expect(loadEnv()).rejects.toThrow(/NODE_ENV must be one of/);
});
