import assert from 'node:assert';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { unzipSync } from 'fflate';

import * as tmpfs from '../../test-utils/tmpfs.ts';
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
});

test('creates a package', async () => {
  const publicFolders = [
    tmpdir, // absolute path
    testAssetsDir, // additional test directory
  ];
  const result = await deterministicArchive([tmpdir, ...publicFolders]);

  assert.notStrictEqual(result.buffer, undefined);
  assert.notStrictEqual(result.hash, undefined);
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

test('picks out the right files', async () => {
  const publicFolders = [
    tmpdir, // absolute path
    testAssetsDir, // additional test directory
  ];
  const { buffer } = await deterministicArchive([tmpdir, ...publicFolders]);

  const zip = unzipSync(new Uint8Array(buffer));
  const entryNames = new Set(Object.keys(zip));

  // Check that our test files are included
  assert(
    entryNames.has('solid-white.png'),
    'solid-white.png should be in the archive',
  );
  assert(entryNames.has('one.jpg'), 'one.jpg should be in the archive');
  assert(
    entryNames.has('subfolder/nested.txt'),
    'subfolder/nested.txt should be in the archive',
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
  assert.deepStrictEqual(resultNormal.buffer, resultWithPossibleDuplicates.buffer);

  const zip = unzipSync(new Uint8Array(resultWithPossibleDuplicates.buffer));
  const entries = Object.keys(zip)
    // Filter out any system files that might be created
    .filter((entryName) => !entryName.includes('.DS_Store'));

  // We expect 6 files: 5 from main directory + 1 from test-assets directory
  // (one.jpg appears in both directories but should be deduplicated)
  const expectedFileCount = 6; // solid-white.png, one.jpg, subfolder/nested.txt, empty.txt, binary.bin, test-assets/one.jpg
  assert.strictEqual(entries.length, expectedFileCount);
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

  const zip = unzipSync(new Uint8Array(result.buffer));
  const myFile = zip['my-in-memory-file.txt'];
  assert(myFile, 'my-in-memory-file.txt should exist in the zip');
  assert.strictEqual(new TextDecoder().decode(myFile), content);
});

test('handles relative paths', async () => {
  const result = await deterministicArchive([testAssetsDir]);
  const zip = unzipSync(new Uint8Array(result.buffer));

  const entries = Object.keys(zip)
    // Filter out any system files that might be created
    .filter((entryName) => !entryName.includes('.DS_Store'));

  assert.deepStrictEqual(entries, ['one.jpg']);
});

test('keeps folder structure when adding single files', async () => {
  const singleFilePath = path.join(tmpdir, 'subfolder', 'nested.txt');
  const result = await deterministicArchive([singleFilePath]);
  const zip = unzipSync(new Uint8Array(result.buffer));

  const entries = Object.keys(zip)
    // Filter out any system files that might be created
    .filter((entryName) => !entryName.includes('.DS_Store'));

  assert.deepStrictEqual(entries, ['subfolder/nested.txt']);
});

test('keeps folder structure when adding single files with absolute paths', async () => {
  const singleFilePath = path.join(tmpdir, 'subfolder', 'nested.txt');
  const result = await deterministicArchive([singleFilePath]);
  const zip = unzipSync(new Uint8Array(result.buffer));

  const entries = Object.keys(zip)
    // Filter out any system files that might be created
    .filter((entryName) => !entryName.includes('.DS_Store'));

  assert.deepStrictEqual(entries, ['subfolder/nested.txt']);
});
