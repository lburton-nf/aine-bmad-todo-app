import { buildServer } from './server';
import { env } from './env';
import { initialize } from './db';

async function main(): Promise<void> {
  const db = initialize(env.DB_PATH);
  const app = await buildServer({
    corsOrigin: env.CORS_ORIGIN,
    db,
    staticRoot: env.STATIC_ROOT,
  });

  // SIGTERM (Docker) and SIGINT (Ctrl-C): app.close() drains in-flight
  // requests and triggers onClose to close the db.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'shutting down');
      void app.close().then(
        () => process.exit(0),
        (err: unknown) => {
          app.log.error(err, 'error during shutdown');
          process.exit(1);
        },
      );
    });
  }

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  // Logger may not have constructed yet; fall back to stderr.
  console.error('Fatal during bootstrap:', err);
  process.exit(1);
});
