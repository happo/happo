import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, before, describe, it } from 'node:test';

import buildHappoStorybookRuntime from '../../test-utils/buildHappoStorybookRuntime.ts';
import buildStorybookPackage from '../index.ts';

const ONE_STORY_INDEX = {
  v: 5,
  entries: {
    'component--story': {
      id: 'component--story',
      title: 'Component',
      name: 'Story',
      type: 'story',
      importPath: './Component.stories.ts',
    },
  },
};

const createdDirs: Array<string> = [];

/**
 * Writes the two files `buildStorybookPackage` reads out of an already-built
 * Storybook, so these tests can exercise what happens *after* the build
 * without paying for one.
 */
function createPackage({
  iframeContent = '<html><head></head><body></body></html>',
  index = ONE_STORY_INDEX,
}: {
  iframeContent?: string;
  index?: unknown;
} = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'happo-preflight-'));
  createdDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'iframe.html'), iframeContent);
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index));
  return dir;
}

describe('the built package', () => {
  before(async () => {
    await buildHappoStorybookRuntime();
  });

  afterEach(() => {
    let dir: string | undefined;
    while ((dir = createdDirs.pop())) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('carries the Happo client runtime', async () => {
    const outputDir = createPackage();

    await buildStorybookPackage({ usePrebuiltPackage: true, outputDir });

    const runtimePath = path.join(outputDir, 'happo-storybook-runtime.js');
    assert.ok(fs.existsSync(runtimePath), 'runtime was not copied');

    // It has to run as a plain script in the Storybook preview, so it must be
    // self-contained -- no import statements left for the browser to resolve.
    const runtime = fs.readFileSync(runtimePath, 'utf8');
    assert.ok(
      runtime.includes('globalThis.happo'),
      'runtime does not define globalThis.happo',
    );
    assert.doesNotMatch(runtime, /^\s*import\s/m, 'runtime is not self-contained');
  });

  it('loads the runtime from iframe.html', async () => {
    const outputDir = createPackage();

    await buildStorybookPackage({ usePrebuiltPackage: true, outputDir });

    const iframe = fs.readFileSync(path.join(outputDir, 'iframe.html'), 'utf8');
    assert.match(iframe, /<script[^>]+src="\.\/happo-storybook-runtime\.js"/);

    // Ahead of the preview bundle, which Storybook loads as a module and so
    // defers: a user who also imports the runtime from their
    // `.storybook/preview` file gets theirs applied last, on top of this one.
    assert.ok(
      iframe.indexOf('happo-storybook-runtime.js') < iframe.indexOf('</head>'),
      'runtime is not loaded from the document head',
    );
  });

  it('fails when iframe.html has nowhere to put the runtime', async () => {
    const outputDir = createPackage({
      iframeContent: '<html><HEAD></HEAD><body></body></html>',
    });

    await assert.rejects(
      buildStorybookPackage({ usePrebuiltPackage: true, outputDir }),
      /could not add its client runtime/,
    );
  });

  it('is not fooled by a document that only mentions the runtime', async () => {
    const outputDir = createPackage({
      iframeContent:
        '<html><HEAD></HEAD><body>happo-storybook-runtime.js</body></html>',
    });

    await assert.rejects(
      buildStorybookPackage({ usePrebuiltPackage: true, outputDir }),
      /could not add its client runtime/,
    );
  });

  it('fails when the Storybook contains no stories', async () => {
    const outputDir = createPackage({ index: { v: 5, entries: {} } });

    await assert.rejects(
      buildStorybookPackage({ usePrebuiltPackage: true, outputDir }),
      /does not contain any stories/,
    );
  });

  it('allows an empty story count when --only asked for it', async () => {
    const outputDir = createPackage();

    const result = await buildStorybookPackage({
      usePrebuiltPackage: true,
      outputDir,
      only: [],
    });

    assert.strictEqual(result.estimatedSnapsCount, 0);
  });

  it('allows an empty story count when --skip asked for it', async () => {
    const outputDir = createPackage();

    const result = await buildStorybookPackage({
      usePrebuiltPackage: true,
      outputDir,
      skip: [{ component: 'Component' }],
    });

    assert.strictEqual(result.estimatedSnapsCount, 0);
  });
});
