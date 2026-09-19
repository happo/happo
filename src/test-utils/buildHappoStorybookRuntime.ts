import fs from 'node:fs';
import path from 'node:path';

import * as esbuild from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUTFILE = path.join(
  ROOT,
  'dist',
  'storybook',
  'standalone',
  'register.js',
);

/**
 * Builds the standalone Happo Storybook runtime if it is not already on disk.
 *
 * `buildStorybookPackage()` copies that file into every package it builds, and
 * it only ever exists in `dist/` -- but `pnpm test` does not run `build:dist`
 * first, so a fresh checkout has no `dist/` at all. Keep this in step with the
 * matching entry in `scripts/build.ts`.
 */
export default async function buildHappoStorybookRuntime(): Promise<void> {
  if (fs.existsSync(OUTFILE)) {
    return;
  }

  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'storybook', 'browser', 'register.ts')],
    outfile: OUTFILE,
    bundle: true,
    packages: 'bundle',
    format: 'iife',
    platform: 'browser',
    target: 'esnext',
    sourcemap: false,
  });
}
