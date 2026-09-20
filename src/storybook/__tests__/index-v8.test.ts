import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';

import buildHappoStorybookRuntime from '../../test-utils/buildHappoStorybookRuntime.ts';
import happoStorybookPlugin from '../index.ts';

// Stories in storybook-app-v8:
//   Simple: Basic, Excluded, Themed  → 3 story entries in index.json
const TOTAL_STORIES = 3;

/**
 * A string literal from `browser/register.ts`. Distinctive enough not to turn
 * up by accident, and a string, so it survives whatever minifier the user's
 * Storybook builder happens to run.
 */
const RUNTIME_MARKER =
  'Missing examples. Make sure to call the init function before calling nextExample.';

function readJsFiles(dir: string): Array<string> {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return readJsFiles(full);
      }
      return entry.name.endsWith('.js') ? [full] : [];
    });
}

describe('happoStorybookPlugin (v8-compatible app)', () => {
  let packageDir: string;
  let estimatedSnapsCount: number | undefined;

  before(async () => {
    await buildHappoStorybookRuntime();
    ({ packageDir, estimatedSnapsCount } = await happoStorybookPlugin({
      configDir: 'src/storybook/__tests__/storybook-app-v8',
      outputDir: '.out-v8',
    }));
  });

  it('removes project.json after build', () => {
    assert.strictEqual(fs.existsSync(path.join(packageDir, 'project.json')), false);
  });

  it('returns estimatedSnapsCount from index.json', () => {
    assert.strictEqual(estimatedSnapsCount, TOTAL_STORIES);
  });

  // This fixture is deliberately the one that imports the Happo client runtime
  // nowhere, so that `pnpm test:storybook:v8` and `injectedRuntime.spec.ts`
  // exercise a package whose only copy of the runtime is the one the CLI put
  // there. An import added to its preview or its stories would take that
  // coverage away without failing anything, so it fails here instead.
  it('leaves the injected runtime as the only copy in the package', () => {
    const runtimePath = path.join(packageDir, 'happo-storybook-runtime.js');
    assert.ok(
      fs.readFileSync(runtimePath, 'utf8').includes(RUNTIME_MARKER),
      'expected the injected runtime to contain the marker this test looks for',
    );

    const bundled = readJsFiles(path.join(packageDir, 'assets')).filter((file) =>
      fs.readFileSync(file, 'utf8').includes(RUNTIME_MARKER),
    );
    assert.deepStrictEqual(
      bundled,
      [],
      `${path.basename(packageDir)} bundles its own copy of the Happo runtime. ` +
        'Something under storybook-app-v8 imports `browser/register.ts` — see its preview.ts.',
    );
  });
});
