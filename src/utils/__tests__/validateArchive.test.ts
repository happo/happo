import assert from 'node:assert';
import type fs from 'node:fs';
import { describe, it } from 'node:test';

import type { EntryData } from 'archiver';

import validateArchive from '../validateArchive.ts';

function makeStats(size: number): fs.Stats {
  return {
    size,
    isFile: () => true,
    isDirectory: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 0,
    uid: 0,
    gid: 0,
    rdev: 0,
    blksize: 0,
    blocks: 0,
    atime: new Date(),
    mtime: new Date(),
    ctime: new Date(),
    birthtime: new Date(),
    atimeMs: 0,
    mtimeMs: 0,
    ctimeMs: 0,
    birthtimeMs: 0,
  };
}

describe('validateArchive', () => {
  it('does not throw when totalBytes is lower than 30 MB', () => {
    assert.strictEqual(validateArchive(100, []), undefined);
  });

  it('throws an error with a list of sorted files by size, when size is inside larger than 60 MiB', () => {
    const totalBytes = 73 * 1024 * 1024 + 2346;
    const entries: Array<EntryData | { name: string; size: number }> = [
      { name: 'rar.png', stats: makeStats(95_000_000) }, // inside stats object
      { name: 'dar.png', stats: makeStats(78_000_000) },
      { name: 'foo.png', size: 98_000_000 }, // outside stats object
      { name: 'bar.png', stats: makeStats(8_000_000) },
      { name: 'scar.png', size: 88_000_000 },
      { name: 'car.png' }, // no size
    ];

    assert.throws(
      () => validateArchive(totalBytes, entries),
      /Package size is 73 MB.*maximum is 60 MB.*foo.png: 93 MB.*rar.png: 91 MB.*scar.png: 84 MB/s,
    );
  });
});
