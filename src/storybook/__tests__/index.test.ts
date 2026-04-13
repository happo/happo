import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';

import happoStorybookPlugin from '../index.ts';

describe('happoStorybookPlugin', () => {
  let packageDir: string;
  let estimatedSnapsCount: number | undefined;

  before(async () => {
    ({ packageDir, estimatedSnapsCount } = await happoStorybookPlugin({
      configDir: 'src/storybook/__tests__/storybook-app',
    }));
  });

  it('removes the project.json after build', () => {
    assert.strictEqual(fs.existsSync(path.join(packageDir, 'project.json')), false);
  });

  it('returns estimatedSnapsCount read from the real Storybook index.json', () => {
    // This test ensures getStorybookStoryCount works against the format that
    // the installed version of Storybook actually produces. If Storybook
    // changes its index.json structure, this test will catch it.
    // 22 stories across Story.stories.ts (20) and Interactive.stories.ts (2)
    assert.strictEqual(estimatedSnapsCount, 22);
  });

  describe('with --skip', () => {
    it('reduces estimatedSnapsCount when skipping a whole component', async () => {
      // Interactive has 2 stories (Demo + Interactive Throws Error)
      const result = await happoStorybookPlugin({
        usePrebuiltPackage: true,
        skip: [{ component: 'Interactive' }],
      });
      assert.strictEqual(result.estimatedSnapsCount, 20);
    });

    it('reduces estimatedSnapsCount when skipping a single variant', async () => {
      const result = await happoStorybookPlugin({
        usePrebuiltPackage: true,
        skip: [{ component: 'Stories', variant: 'Lazy' }],
      });
      assert.strictEqual(result.estimatedSnapsCount, 21);
    });
  });
});
