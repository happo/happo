import assert from 'node:assert';
import { describe, it } from 'node:test';

import validateArchive from '../validateArchive.ts';

describe('validateArchive', () => {
  it('does not throw when totalBytes is lower than 30 MB', () => {
    assert.strictEqual(validateArchive(100, []), undefined);
  });

  it('throws an error with a list of sorted files by size, when size is inside larger than 60 MiB', () => {
    const totalBytes = 73 * 1024 * 1024 + 2346;
    const entries = [
      { name: 'rar.png', size: 95_000_000 },
      { name: 'dar.png', size: 78_000_000 },
      { name: 'foo.png', size: 98_000_000 },
      { name: 'bar.png', size: 8_000_000 },
      { name: 'scar.png', size: 88_000_000 },
      { name: 'car.png', size: 0 }, // no size
    ];

    assert.throws(
      () => validateArchive(totalBytes, entries),
      /Package size is 73 MB.*maximum is 60 MB.*foo.png: 93 MB.*rar.png: 91 MB.*scar.png: 84 MB/s,
    );
  });
});
