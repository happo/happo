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
 *
 * Several test files need the runtime and the test runner runs them in
 * parallel, so more than one can find it missing and start building. Each
 * builds to a path of its own and moves it into place, which is atomic: a
 * concurrent reader sees one complete file or the other, never a half-written
 * one, and the last writer wins with identical bytes.
 */
export default async function buildHappoStorybookRuntime(): Promise<void> {
  if (fs.existsSync(OUTFILE)) {
    return;
  }

  const scratchFile = `${OUTFILE}.${process.pid}.tmp`;

  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'storybook', 'browser', 'register.ts')],
    outfile: scratchFile,
    bundle: true,
    packages: 'bundle',
    format: 'iife',
    platform: 'browser',
    target: 'esnext',
    sourcemap: false,
  });

  try {
    await fs.promises.rename(scratchFile, OUTFILE);
  } catch (error) {
    await fs.promises.rm(scratchFile, { force: true });
    throw error;
  }
}
