import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';

import happoStorybookPlugin from '../index.ts';

// Stories in storybook-app-v8:
//   Simple: Basic, Excluded, Themed  → 3 story entries in index.json
const TOTAL_STORIES = 3;

describe('happoStorybookPlugin (v8-compatible app)', () => {
  let packageDir: string;
  let estimatedSnapsCount: number | undefined;

  before(async () => {
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
});
