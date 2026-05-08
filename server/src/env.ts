// Single source of env truth. Parse-once at module load; freeze the result.

const NODE_ENVS = ['development', 'production', 'test'] as const;
type NodeEnv = (typeof NODE_ENVS)[number];

function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === undefined || value === '') return 'development';
  if ((NODE_ENVS as readonly string[]).includes(value)) {
    return value as NodeEnv;
  }
  throw new Error(
    `NODE_ENV must be one of ${NODE_ENVS.join(', ')} (got: '${value}'). ` +
      `Typos like 'produciton' silently deploying as 'development' are blocked here.`,
  );
}

function parsePort(value: string | undefined): number {
  const raw = value ?? '3000';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer in 1..65535 (got: '${raw}').`);
  }
  return port;
}

const NODE_ENV = parseNodeEnv(process.env.NODE_ENV);
const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? '').trim();

if (NODE_ENV === 'production' && CORS_ORIGIN === '') {
  throw new Error(
    'CORS_ORIGIN env var is required when NODE_ENV=production (single-origin allow-list).',
  );
}

export const env = Object.freeze({
  PORT: parsePort(process.env.PORT),
  DB_PATH: process.env.DB_PATH ?? '/data/todos.db',
  CORS_ORIGIN,
  NODE_ENV,
});

export type Env = typeof env;
