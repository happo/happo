import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import * as tmpfs from '../tmpfs.ts';

it('creates the files in the temp dir', () => {
  tmpfs.mock({
    'test.txt': 'I like pizza',
    subdir: {
      'test2.txt': 'I like ice cream',
    },
  });

  assert.strictEqual(
    fs.readFileSync(path.join(tmpfs.getTempDir(), 'test.txt'), 'utf8'),
    'I like pizza',
  );

  assert.strictEqual(
    fs.readFileSync(path.join(tmpfs.getTempDir(), 'subdir', 'test2.txt'), 'utf8'),
    'I like ice cream',
  );

  const allFiles = fs.readdirSync(tmpfs.getTempDir());
  assert.deepStrictEqual(allFiles, ['subdir', 'test.txt']);
  assert.deepStrictEqual(fs.readdirSync(path.join(tmpfs.getTempDir(), 'subdir')), [
    'test2.txt',
  ]);

  tmpfs.restore();
});

describe('getTempDir', () => {
  it('returns an empty string if no temp dir is set', () => {
    assert.strictEqual(tmpfs.getTempDir(), '');
  });

  it('returns a non-empty string if a temp dir is set', () => {
    tmpfs.mock({});
    assert.match(tmpfs.getTempDir(), /^\/\w+/);
    tmpfs.restore();
  });
});

describe('exec', () => {
  it('throws an error if exec is called before mock', () => {
    assert.throws(
      () => tmpfs.exec('echo', ['Hello, world!']),
      new Error('tmpfs exec() called before mock()'),
    );
  });

  describe('after tmpfs mock', () => {
    beforeEach(() => {
      tmpfs.mock({
        'test.txt': 'Hello, world!',
      });
    });

    afterEach(() => {
      tmpfs.restore();
    });

    it('can exec commands with arguments', () => {
      const result = tmpfs.exec('echo', ['Hello, world!']);
      assert.strictEqual(result, 'Hello, world!\n');
    });

    it('executes in the temp dir', () => {
      const result = tmpfs.exec('pwd');
      assert.strictEqual(result, tmpfs.getTempDir() + '\n');
    });
  });
});
