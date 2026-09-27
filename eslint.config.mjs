// Flat ESLint config for `yarn lint` (`eslint .`). Next.js 16 removed `next lint`,
// so this file is the lint entry point; eslint-config-next 16 ships flat configs.
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  globalIgnores(['.next/**', '.build/**', 'node_modules/**', 'out/**', 'build/**', 'next-env.d.ts']),
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      // Pre-existing, widespread "fetch on mount" pattern (useEffect calling a loader that
      // sets a loading flag synchronously) across many components — a real architectural
      // convention here, not an isolated bug. Downgraded to warn rather than silently
      // rewriting each call site's async timing without per-component testing.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // next.config.js is loaded directly by Node/Next as CommonJS and conditionally
    // requires a JSON file at runtime — it cannot be an ESM import here.
    files: ['next.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
