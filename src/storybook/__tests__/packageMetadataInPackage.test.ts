import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import readArchive from '../../test-utils/readArchive.ts';
import {
  archivePackageWithMetadata,
  PACKAGE_METADATA_FILENAME,
  type PackageMetadata,
} from '../../utils/packageMetadata.ts';
import happoStorybookPlugin from '../index.ts';

/**
 * The point of the metadata file is that a worker can read it out of a real
 * package without loading anything, so these build a real Storybook, archive
 * it through the same function `preparePackage()` calls, and read it back out
 * of the archive.
 *
 * Going through `archivePackageWithMetadata()` rather than reproducing its two
 * calls is the difference between testing that the package ships the file and
 * testing that a test can build an archive.
 */
describe('package metadata in a built package', () => {
  let outputDir: string;
  let metadata: PackageMetadata;
  let archived: Map<string, Buffer>;

  before(async () => {
    outputDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'happo-metadata-'),
    );

    const result = await happoStorybookPlugin({
      configDir: 'src/storybook/__tests__/storybook-app',
      outputDir,
      skip: [{ component: 'Interactive' }],
    });

    const archiveResult = await archivePackageWithMetadata(outputDir, {
      integration: 'storybook',
      skipped: result.resolvedSkip,
      only: result.resolvedOnly,
      estimatedSnapsCount: result.estimatedSnapsCount,
    });
    metadata = archiveResult.metadata;
    archived = readArchive(archiveResult.buffer);
  });

  after(async () => {
    await fs.promises.rm(outputDir, { recursive: true, force: true });
  });

  it('ships at the root of the archive', () => {
    assert.ok(
      archived.has(PACKAGE_METADATA_FILENAME),
      `expected ${PACKAGE_METADATA_FILENAME} in the archive, got: ${[...archived.keys()].join(', ')}`,
    );
  });

  it('is valid JSON carrying the resolved skip list', () => {
    const parsed = JSON.parse(
      archived.get(PACKAGE_METADATA_FILENAME)!.toString('utf8'),
    ) as PackageMetadata;

    assert.strictEqual(parsed.version, 1);
    assert.strictEqual(parsed.integration, 'storybook');
    assert.deepStrictEqual(parsed.skipped, [{ component: 'Interactive' }]);
    // What landed in the archive is what the helper says it built, rather than
    // something that happened to look right.
    assert.deepStrictEqual(parsed, metadata);
  });

  it('agrees with the skip list baked into iframe.html', () => {
    // The inline script stays for the browser to read. If the two ever
    // disagree, a worker reading the file would skip a different set of
    // stories than the browser would -- so they have to come from the same
    // resolution, and this is what says so.
    const iframe = archived.get('iframe.html')!.toString('utf8');
    const match = iframe.match(/window\.happoSkipped\s*=\s*(.*?);<\/script>/);
    assert.ok(match, 'expected window.happoSkipped in iframe.html');

    const parsed = JSON.parse(
      archived.get(PACKAGE_METADATA_FILENAME)!.toString('utf8'),
    ) as PackageMetadata;
    assert.deepStrictEqual(JSON.parse(match[1]!), parsed.skipped);
  });

  it('does not write itself into the user build output', () => {
    // It is archive content, not a file we leave behind in their outputDir.
    assert.strictEqual(
      fs.existsSync(path.join(outputDir, PACKAGE_METADATA_FILENAME)),
      false,
    );
  });
});
