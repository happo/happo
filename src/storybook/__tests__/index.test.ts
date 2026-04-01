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
    // 23 stories across Story.stories.ts (21) and Interactive.stories.ts (2)
    assert.strictEqual(estimatedSnapsCount, 23);
  });

  it('injects __HAPPO_FAIL_ON_RENDER_ERROR = false into iframe.html by default', () => {
    const iframeContent = fs.readFileSync(
      path.join(packageDir, 'iframe.html'),
      'utf8',
    );
    assert.ok(
      iframeContent.includes('window.__HAPPO_FAIL_ON_RENDER_ERROR = false'),
      'iframe.html should include __HAPPO_FAIL_ON_RENDER_ERROR = false by default',
    );
  });
});

describe('happoStorybookPlugin with failOnRenderError: true', () => {
  let packageDir: string;

  before(async () => {
    ({ packageDir } = await happoStorybookPlugin({
      configDir: 'src/storybook/__tests__/storybook-app',
      failOnRenderError: true,
      usePrebuiltPackage: true,
    }));
  });

  it('injects __HAPPO_FAIL_ON_RENDER_ERROR = true into iframe.html', () => {
    const iframeContent = fs.readFileSync(
      path.join(packageDir, 'iframe.html'),
      'utf8',
    );
    assert.ok(
      iframeContent.includes('window.__HAPPO_FAIL_ON_RENDER_ERROR = true'),
      'iframe.html should include __HAPPO_FAIL_ON_RENDER_ERROR = true when failOnRenderError is enabled',
    );
  });
});
