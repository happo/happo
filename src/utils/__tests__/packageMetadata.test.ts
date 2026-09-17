import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';

import readArchive from '../../test-utils/readArchive.ts';
import {
  archivePackageWithMetadata,
  createPackageMetadata,
  PACKAGE_METADATA_FILENAME,
  PACKAGE_METADATA_VERSION,
} from '../packageMetadata.ts';

it('ships at a stable path so a reader can find it', () => {
  assert.strictEqual(PACKAGE_METADATA_FILENAME, 'happo-metadata.json');
});

it('stamps the version, so a reader can tell whether it understands the shape', () => {
  const metadata = createPackageMetadata({ integration: 'storybook' });
  assert.strictEqual(metadata.version, PACKAGE_METADATA_VERSION);
});

it('defaults to "nothing was filtered" rather than to undefined', () => {
  // A reader should be able to use these without checking whether they exist.
  const metadata = createPackageMetadata({ integration: 'custom' });
  assert.deepStrictEqual(metadata.skipped, []);
  assert.strictEqual(metadata.only, null);
});

it('keeps an empty only list distinct from no only list', () => {
  // An empty list is a filter that matched nothing, which is how a run renders
  // none of its own examples and borrows them all from a baseline. Collapsing
  // it to null would read as "no filter" and mean the opposite.
  const noFilter = createPackageMetadata({ integration: 'storybook' });
  const matchedNothing = createPackageMetadata({
    integration: 'storybook',
    only: [],
  });

  assert.strictEqual(noFilter.only, null);
  assert.deepStrictEqual(matchedNothing.only, []);
});

it('carries the resolved filters through', () => {
  const metadata = createPackageMetadata({
    integration: 'storybook',
    skipped: [{ component: 'Button' }, { component: 'Card', variant: 'Wide' }],
    only: [{ component: 'Button' }],
    estimatedSnapsCount: 12,
  });

  assert.deepStrictEqual(metadata.skipped, [
    { component: 'Button' },
    { component: 'Card', variant: 'Wide' },
  ]);
  assert.deepStrictEqual(metadata.only, [{ component: 'Button' }]);
  assert.strictEqual(metadata.estimatedSnapsCount, 12);
});

it('leaves out a snap count it does not have', () => {
  const metadata = createPackageMetadata({ integration: 'storybook' });
  assert.strictEqual('estimatedSnapsCount' in metadata, false);
});

it('survives a JSON round trip, which is how it reaches a reader', () => {
  const metadata = createPackageMetadata({
    integration: 'storybook',
    skipped: [{ component: 'Card', variant: 'Wide' }],
    only: [{ component: 'Button' }],
    estimatedSnapsCount: 3,
  });

  // Serialized exactly the way it is written into the archive, rather than
  // deep-cloned: what is being checked is that nothing survives only in
  // memory.
  const serialized = JSON.stringify(metadata, null, 2);

  assert.deepStrictEqual(JSON.parse(serialized), metadata);
});

it('leaves out a count that is not a real number', () => {
  // JSON.stringify turns Infinity and NaN into `null`, which would put a value
  // in the shipped file that contradicts the type it claims to be.
  for (const notANumber of [Number.POSITIVE_INFINITY, Number.NaN]) {
    const metadata = createPackageMetadata({
      integration: 'custom',
      estimatedSnapsCount: notANumber,
    });

    assert.strictEqual(
      'estimatedSnapsCount' in metadata,
      false,
      `expected ${notANumber} to be left out`,
    );
    // Specifically this key: `only: null` is a legitimate part of the file.
    const serialized = JSON.stringify(metadata);
    assert.strictEqual(
      JSON.parse(serialized).estimatedSnapsCount,
      undefined,
      'a non-finite count must not reach the file as null',
    );
  }
});

it('wins against a file of the same name in the build output', async () => {
  // A reader trusts whatever is at this path. Shipping a user's file in its
  // place would have them read arbitrary content as metadata -- and the
  // archive prefers files on disk over supplied content by default, so this
  // needs saying out loud.
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'happo-clash-'));
  try {
    await fs.promises.writeFile(
      path.join(dir, PACKAGE_METADATA_FILENAME),
      JSON.stringify({ iAm: 'the user own file' }),
    );
    await fs.promises.writeFile(path.join(dir, 'iframe.html'), '<html></html>');

    const { buffer } = await archivePackageWithMetadata(dir, {
      integration: 'storybook',
      skipped: [{ component: 'Button' }],
    });

    const shipped = JSON.parse(
      readArchive(buffer).get(PACKAGE_METADATA_FILENAME)!.toString('utf8'),
    );

    assert.strictEqual(shipped.iAm, undefined);
    assert.deepStrictEqual(shipped.skipped, [{ component: 'Button' }]);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});
