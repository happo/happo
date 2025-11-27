#!/usr/bin/env node

import * as esbuild from 'esbuild';

interface EntryConfig {
  entryPoints: Array<string>;
  outdir: `dist/${string}`;
  platform: 'node' | 'browser';
  packages?: 'bundle' | 'external';
  format?: 'esm' | 'iife';
}

const DIST_CONFIGS: Array<EntryConfig> = [
  {
    entryPoints: ['src/browser/main.ts'],
    outdir: 'dist/browser',
    platform: 'browser',

    // This is bundled to be consumed directly in the browser vs being imported
    // by something that will be bundled later (e.g. storybook), so we need to
    // bundle the dependencies.
    packages: 'bundle',
    format: 'iife',
  },

  {
    entryPoints: ['src/cli/main.ts'],
    outdir: 'dist/cli',
    platform: 'node',
  },

  {
    entryPoints: ['src/config/index.ts'],
    outdir: 'dist/config',
    platform: 'node',
  },

  {
    entryPoints: [
      'src/storybook/browser/addon.ts',
      'src/storybook/browser/decorator.ts',
      'src/storybook/browser/register.ts',
    ],
    outdir: 'dist/storybook/browser',
    platform: 'browser',
  },

  {
    entryPoints: ['src/storybook/index.ts', 'src/storybook/preset.ts'],
    outdir: 'dist/storybook',
    platform: 'node',
  },

  {
    entryPoints: ['src/cypress/index.ts', 'src/cypress/task.ts'],
    outdir: 'dist/cypress',
    platform: 'node',
  },

  {
    entryPoints: ['src/playwright/index.ts'],
    outdir: 'dist/playwright',
    platform: 'node',
  },

  {
    entryPoints: ['src/custom/index.ts'],
    outdir: 'dist/custom',
    platform: 'node',
  },
];

async function main() {
  const buildPromises: Array<Promise<esbuild.BuildResult>> = [];

  for (const config of DIST_CONFIGS) {
    const isBrowser = config.platform === 'browser';

    const esbuildOptions: esbuild.BuildOptions = {
      // https://esbuild.github.io/api/#entry-points
      entryPoints: config.entryPoints,

      // https://esbuild.github.io/api/#outdir
      outdir: config.outdir,

      // https://esbuild.github.io/api/#bundle
      bundle: true,

      // https://esbuild.github.io/api/#sourcemap
      sourcemap: 'linked',

      // https://esbuild.github.io/api/#packages
      packages: config.packages ?? 'external',

      // https://esbuild.github.io/api/#format
      format: config.format ?? 'esm',

      // https://esbuild.github.io/api/#platform
      platform: config.platform,

      // https://esbuild.github.io/api/#target
      target: isBrowser ? 'esnext' : 'node22',

      // https://esbuild.github.io/api/#splitting
      splitting: config.format === 'iife' ? false : true,
    };

    buildPromises.push(esbuild.build(esbuildOptions));
  }

  const results = await Promise.all(buildPromises);

  const errors: Array<string> = [];
  const warnings: Array<string> = [];

  for (const result of results) {
    errors.push(...result.errors.map((error) => error.text));
    warnings.push(...result.warnings.map((warning) => warning.text));
  }

  if (errors.length > 0) {
    console.error('Errors:', errors);
    process.exitCode = 1;
  }

  if (warnings.length > 0) {
    console.warn('Warnings:', warnings);
  }

  return results;
}

if (import.meta.main) {
  await main();
}
