import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
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

  describe('with --only', () => {
    it('reduces estimatedSnapsCount to the matched component', async () => {
      // Interactive has 2 stories (Demo + Interactive Throws Error)
      const result = await happoStorybookPlugin({
        usePrebuiltPackage: true,
        only: [{ component: 'Interactive' }],
      });
      assert.strictEqual(result.estimatedSnapsCount, 2);
    });

    it('reduces estimatedSnapsCount when matching via storyFile', async () => {
      // Story.stories.ts has 20 stories under the Stories component
      const result = await happoStorybookPlugin({
        usePrebuiltPackage: true,
        only: [
          {
            storyFile:
              './src/storybook/__tests__/storybook-app/Story.stories.ts',
          },
        ],
      });
      assert.strictEqual(result.estimatedSnapsCount, 20);
    });

    it('treats an empty --only array as "borrow everything from baseline"', async () => {
      const result = await happoStorybookPlugin({
        usePrebuiltPackage: true,
        only: [],
      });
      assert.strictEqual(result.estimatedSnapsCount, 0);
      // resolvedSkip should contain every component in the storybook so the
      // extends-report can borrow them all from the baseline.
      assert.ok(result.resolvedSkip);
      const components = new Set(result.resolvedSkip.map((s) => s.component));
      assert.deepStrictEqual(components, new Set(['Stories', 'Interactive']));
    });

    it('with empty --only, components no longer present locally are not borrowed', async () => {
      // Simulate "Interactive" being deleted from the local Storybook by
      // pointing the plugin at a temp copy of the prebuilt package whose
      // index.json has had the Interactive entries removed. The extends-report
      // should only borrow components that still exist locally, so deleted
      // stories stay deleted.
      const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'happo-only-empty-deleted-'),
      );
      try {
        await fs.promises.copyFile(
          path.join(packageDir, 'iframe.html'),
          path.join(tempDir, 'iframe.html'),
        );
        const indexContent = await fs.promises.readFile(
          path.join(packageDir, 'index.json'),
          'utf8',
        );
        const indexData = JSON.parse(indexContent) as {
          entries?: Record<string, { title?: string }>;
        };
        const filteredEntries: Record<string, unknown> = {};
        for (const [id, entry] of Object.entries(indexData.entries ?? {})) {
          if (entry.title !== 'Interactive') {
            filteredEntries[id] = entry;
          }
        }
        await fs.promises.writeFile(
          path.join(tempDir, 'index.json'),
          JSON.stringify({ ...indexData, entries: filteredEntries }),
        );

        const result = await happoStorybookPlugin({
          usePrebuiltPackage: true,
          outputDir: tempDir,
          only: [],
        });
        assert.ok(result.resolvedSkip);
        const components = new Set(result.resolvedSkip.map((s) => s.component));
        assert.deepStrictEqual(components, new Set(['Stories']));
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});
