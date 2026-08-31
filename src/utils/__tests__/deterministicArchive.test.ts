import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import readArchive, {
  archiveEntryNames as entryNames,
} from '../../test-utils/readArchive.ts';
import * as tmpfs from '../../test-utils/tmpfs.ts';
import type { ArchiveFormat } from '../deterministicArchive.ts';
import deterministicArchive from '../deterministicArchive.ts';

let tmpdir: string;
let testAssetsDir: string;

beforeEach(() => {
  // Create tmpfs with test files
  tmpdir = tmpfs.mock({
    'solid-white.png': 'fake-png-data',
    'one.jpg': 'fake-jpg-data',
    subfolder: {
      'nested.txt': 'nested file content',
    },
    'empty.txt': '',
    'binary.bin': Buffer.from([0x00, 0x01, 0x02, 0x03]).toString('binary'),
    'test-assets': {
      'one.jpg': 'fake-jpg-data',
    },
  });

  // Create a separate directory for additional test files
  testAssetsDir = path.join(tmpdir, 'test-assets');
});

afterEach(() => {
  tmpfs.restore();
  delete process.env.HAPPO_ARCHIVE_FORMAT;
});

describe('format selection', () => {
  test('defaults to zstd when Node supports it', async () => {
    const { format, buffer } = await deterministicArchive([testAssetsDir]);

    assert.strictEqual(format, 'zstd');
    assert.deepStrictEqual(
      buffer.subarray(0, 4),
      Buffer.from([0x28, 0xb5, 0x2f, 0xfd]),
      'should start with the zstd magic bytes',
    );
  });

  test('HAPPO_ARCHIVE_FORMAT=zip forces a zip archive', async () => {
    process.env.HAPPO_ARCHIVE_FORMAT = 'zip';

    const { format, buffer } = await deterministicArchive([testAssetsDir]);

    assert.strictEqual(format, 'zip');
    assert.strictEqual(buffer.subarray(0, 2).toString(), 'PK');
  });

  test('rejects an unknown HAPPO_ARCHIVE_FORMAT', async () => {
    process.env.HAPPO_ARCHIVE_FORMAT = 'brotli';

    await assert.rejects(
      () => deterministicArchive([testAssetsDir]),
      /Unknown HAPPO_ARCHIVE_FORMAT/,
    );
  });

  test('zstd produces a smaller archive than zip for the same content', async () => {
    process.env.HAPPO_ARCHIVE_FORMAT = 'zip';
    const asZip = await deterministicArchive([tmpdir]);

    process.env.HAPPO_ARCHIVE_FORMAT = 'zstd';
    const asZstd = await deterministicArchive([tmpdir]);

    assert(
      asZstd.buffer.length < asZip.buffer.length,
      `expected zstd (${asZstd.buffer.length} bytes) to be smaller than zip (${asZip.buffer.length} bytes)`,
    );
  });

  test('the two formats hash differently', async () => {
    process.env.HAPPO_ARCHIVE_FORMAT = 'zip';
    const asZip = await deterministicArchive([tmpdir]);

    process.env.HAPPO_ARCHIVE_FORMAT = 'zstd';
    const asZstd = await deterministicArchive([tmpdir]);

    assert.notStrictEqual(asZip.hash, asZstd.hash);
  });
});


describe('golden hashes', () => {
  // These pin the exact bytes we produce for a fixed set of in-memory content.
  // The hash is the dedupe key for uploads, so it has to be identical on every
  // machine that packages the same content — a change here means previously
  // uploaded packages stop being recognized and every client re-uploads.
  //
  // zstd does not promise byte-identical output across library versions (level
  // 3 output changed between zstd 1.5.6 and 1.5.7, which is part of why we
  // compress at level 9). If this test starts failing after a Node upgrade,
  // that is the canary firing: the dedupe key has moved, and the change needs
  // a deliberate decision rather than a new expected value.
  const content = [
    { name: 'a.txt', content: 'the quick brown fox' },
    { name: 'nested/b.json', content: '{"hello":"world"}' },
    { name: 'c.bin', content: Buffer.from([0, 1, 2, 3, 250, 251, 252, 253]) },
  ];

  test('zstd', async () => {
    process.env.HAPPO_ARCHIVE_FORMAT = 'zstd';

    const { hash } = await deterministicArchive([], content);

    assert.strictEqual(hash, '1f29937a8cfeae87eef09da17ed44e46');
  });

  test('zip', async () => {
    process.env.HAPPO_ARCHIVE_FORMAT = 'zip';

    const { hash } = await deterministicArchive([], content);

    assert.strictEqual(hash, '606131078c8af9a07acc81f0376248a0');
  });
});

for (const format of ['zstd', 'zip'] satisfies Array<ArchiveFormat>) {
  describe(`${format} archives`, () => {
    beforeEach(() => {
      process.env.HAPPO_ARCHIVE_FORMAT = format;
    });

    test('creates a package', async () => {
      const publicFolders = [
        tmpdir, // absolute path
        testAssetsDir, // additional test directory
      ];
      const result = await deterministicArchive([tmpdir, ...publicFolders]);

      assert.notStrictEqual(result.buffer, undefined);
      assert.notStrictEqual(result.hash, undefined);
      assert.strictEqual(result.format, format);
    });

    test('creates deterministic hashes when content has not changed', async () => {
      const publicFolders = [
        tmpdir, // absolute path
        testAssetsDir, // additional test directory
      ];
      const promises = Array.from({ length: 20 }).map(() =>
        deterministicArchive([tmpdir, ...publicFolders]),
      );
      const results = await Promise.all(promises);
      const hashes = results.map(({ hash }) => hash);

      assert.strictEqual(hashes.length, 20);
      assert.notStrictEqual(hashes[0], undefined);
      assert.strictEqual(typeof hashes[0], 'string');
      assert(hashes[0] && hashes[0].length > 0);
      assert.strictEqual(
        hashes.every((hash) => hash === hashes[0]),
        true,
      );
    });

    test('produces byte-identical archives across calls', async () => {
      const first = await deterministicArchive([tmpdir]);
      const second = await deterministicArchive([tmpdir]);

      assert.deepStrictEqual(first.buffer, second.buffer);
    });

    test('does not depend on the order the inputs are given in', async () => {
      const forwards = await deterministicArchive([tmpdir, testAssetsDir]);
      const backwards = await deterministicArchive([testAssetsDir, tmpdir]);

      assert.strictEqual(forwards.hash, backwards.hash);
    });

    test('picks out the right files', async () => {
      const publicFolders = [
        tmpdir, // absolute path
        testAssetsDir, // additional test directory
      ];
      const { buffer } = await deterministicArchive([tmpdir, ...publicFolders]);

      const names = new Set(entryNames(buffer));

      // Check that our test files are included
      assert(
        names.has('solid-white.png'),
        'solid-white.png should be in the archive',
      );
      assert(names.has('one.jpg'), 'one.jpg should be in the archive');
      assert(
        names.has('subfolder/nested.txt'),
        'subfolder/nested.txt should be in the archive',
      );
    });

    test('preserves file contents', async () => {
      const { buffer } = await deterministicArchive([tmpdir]);
      const files = readArchive(buffer);

      assert.strictEqual(
        files.get('subfolder/nested.txt')?.toString(),
        'nested file content',
      );
      assert.strictEqual(files.get('empty.txt')?.length, 0);
      assert.deepStrictEqual(
        new Uint8Array(files.get('binary.bin') as Buffer),
        new Uint8Array([0x00, 0x01, 0x02, 0x03]),
      );
    });

    test('does not include duplicate files', async () => {
      const publicFolders = [
        tmpdir, // absolute path
        testAssetsDir, // additional test directory
      ];
      const resultNormal = await deterministicArchive([tmpdir, ...publicFolders]);
      const resultWithPossibleDuplicates = await deterministicArchive([
        tmpdir,
        tmpdir,
        ...publicFolders,
        ...publicFolders,
      ]);
      assert.deepStrictEqual(resultNormal.hash, resultWithPossibleDuplicates.hash);
      assert.deepStrictEqual(
        resultNormal.buffer,
        resultWithPossibleDuplicates.buffer,
      );

      // We expect 6 files: 5 from main directory + 1 from test-assets directory
      // (one.jpg appears in both directories but should be deduplicated)
      const expectedFileCount = 6; // solid-white.png, one.jpg, subfolder/nested.txt, empty.txt, binary.bin, test-assets/one.jpg
      assert.strictEqual(
        entryNames(resultWithPossibleDuplicates.buffer).length,
        expectedFileCount,
      );
    });

    test('can include in-memory content', async () => {
      const publicFolders = [
        tmpdir, // absolute path
        testAssetsDir, // additional test directory
      ];
      const content = 'hi friends';
      const result = await deterministicArchive(
        [tmpdir, ...publicFolders],
        [{ name: 'my-in-memory-file.txt', content }],
      );

      const myFile = readArchive(result.buffer).get('my-in-memory-file.txt');
      assert(myFile, 'my-in-memory-file.txt should exist in the archive');
      assert.strictEqual(myFile.toString(), content);
    });

    test('handles relative paths', async () => {
      const result = await deterministicArchive([testAssetsDir]);

      assert.deepStrictEqual(entryNames(result.buffer), ['one.jpg']);
    });

    test('keeps folder structure when adding single files', async () => {
      const singleFilePath = path.join(tmpdir, 'subfolder', 'nested.txt');
      const result = await deterministicArchive([singleFilePath]);

      assert.deepStrictEqual(entryNames(result.buffer), ['subfolder/nested.txt']);
    });

    test('keeps folder structure when adding single files with absolute paths', async () => {
      const singleFilePath = path.join(tmpdir, 'subfolder', 'nested.txt');
      const result = await deterministicArchive([singleFilePath]);

      assert.deepStrictEqual(entryNames(result.buffer), ['subfolder/nested.txt']);
    });

    test('handles deeply nested paths', async () => {
      const deepDir = path.join(tmpdir, 'a'.repeat(30), 'b'.repeat(30), 'c'.repeat(30));
      fs.mkdirSync(deepDir, { recursive: true });
      fs.writeFileSync(path.join(deepDir, 'deep.txt'), 'deep contents');

      const result = await deterministicArchive([tmpdir]);
      const files = readArchive(result.buffer);
      const deepName = `${'a'.repeat(30)}/${'b'.repeat(30)}/${'c'.repeat(30)}/deep.txt`;

      assert.strictEqual(files.get(deepName)?.toString(), 'deep contents');
    });
  });
}
