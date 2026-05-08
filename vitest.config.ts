import { defineConfig } from 'vitest/config';

// Repo-root vitest config — picks up tests/ at the project root (currently
// just the docker integration test). Per-runtime tests have their own
// configs under client/ and server/.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
