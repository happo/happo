import fs from 'node:fs';
import path from 'node:path';

import { configDefaults, defineConfig, type ViteUserConfig } from 'vitest/config';

// Tests that talk to the real Happo API read HAPPO_API_KEY and HAPPO_API_SECRET
// from here (see .env.example). Loaded into this process so the test workers,
// and anything they spawn, inherit it. Variables already set win.
// Resolved against this file rather than the working directory, which differs
// from it when Vitest is started with --root or --config.
const ENV_FILE = path.join(import.meta.dirname, '.env.local');
if (fs.existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

// Runs `pnpm clean && pnpm build:dist`, which deletes `dist/` out from under
// every other test that reads from it (the Storybook tests copy the runtime
// out of `dist/storybook/standalone/`). It gets a project of its own so it can
// run after them instead of alongside.
const PACKAGE_EXPORTS_TEST = 'src/config/__tests__/packageExports.test.ts';

const config: ViteUserConfig = defineConfig({
  test: {
    setupFiles: ['./src/test-utils/disableTelemetry.ts'],

    // Every mock's calls are cleared before each test. That is Vitest 5's
    // default, but it was off through Vitest 4, so it is spelled out rather
    // than left to whichever version is installed.
    clearMocks: true,

    // Several tests build a real Storybook or drive real git repositories,
    // which takes well past Vitest's defaults (5s per test, 10s per hook) on a
    // cold CI runner. node:test, which these tests ran under before, had no
    // timeouts at all.
    testTimeout: 60_000,
    hookTimeout: 120_000,

    server: {
      deps: {
        // What the tests write to a tmpfs directory stands in for a user's
        // project -- a happo.config.ts, say -- and the code under test imports
        // it the way it will in that project: with Node, not Vite. Left to
        // Vite, an unsupported extension would load as JavaScript instead of
        // failing the way it does for users.
        external: [/[/\\]tmpfs[^/\\]+[/\\]/],
      },
    },

    coverage: {
      exclude: ['**/__tests__/**'],
    },

    // `include` and `exclude` live in the projects, not up here: `extends: true`
    // concatenates arrays, so a project could only ever add to them.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['{src,scripts,tsconfigs}/**/*.test.ts'],

          // The Playwright and Cypress suites test the integrations themselves
          // and run under their own runners (`pnpm test:playwright`,
          // `pnpm test:cypress`).
          exclude: [
            ...configDefaults.exclude,
            '**/__playwright__/**',
            '**/__cypress__/**',
            PACKAGE_EXPORTS_TEST,
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'package-exports',
          include: [PACKAGE_EXPORTS_TEST],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});

export default config;
