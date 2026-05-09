import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'node_modules']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Test files: relax two rules that fight pragmatic test ergonomics.
    // `res.json()` returns a permissive type from light-my-request, so casts to
    // a precise shape are flagged as redundant even though they're how we
    // express test expectations. `require-await` flags act() / inject() helpers
    // that wrap sync code in async signatures expected by the harness.
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
]);
