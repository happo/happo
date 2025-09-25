import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

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
      new Error('tmpfs.exec() called before tmpfs.mock()'),
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
      assert.strictEqual(result, `${tmpfs.getTempDir()}\n`);
    });
  });
});

describe('gitInit', () => {
  it('throws an error if gitInit is called before mock', () => {
    assert.throws(
      () => tmpfs.gitInit(),
      new Error('tmpfs.gitInit() called before tmpfs.mock()'),
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

    it('initializes a git repository', () => {
      assert.strictEqual(
        fs.existsSync(path.join(tmpfs.getTempDir(), '.git')),
        false,
      );

      tmpfs.gitInit();

      assert.strictEqual(fs.existsSync(path.join(tmpfs.getTempDir(), '.git')), true);
    });

    it('uses main as the default branch', () => {
      tmpfs.gitInit();

      const gitBranch = tmpfs.exec('git', ['branch', '--show-current']);
      assert.strictEqual(gitBranch, 'main\n');
    });

    it('commits the files in the temp dir', () => {
      tmpfs.gitInit();

      const gitLs = tmpfs.exec('git', ['ls-files']);
      assert.strictEqual(gitLs, 'test.txt\n');
    });

    it('configures the git user', () => {
      tmpfs.gitInit();

      const gitConfig = tmpfs.exec('git', ['config', 'user.name']);
      assert.strictEqual(gitConfig, 'Test User\n');
    });

    it('configures the git email', () => {
      tmpfs.gitInit();

      const gitConfig = tmpfs.exec('git', ['config', 'user.email']);
      assert.strictEqual(gitConfig, 'test@example.com\n');
    });

    it('can commit more files', () => {
      tmpfs.gitInit();

      fs.writeFileSync(
        path.join(tmpfs.getTempDir(), 'test2.txt'),
        'Hello, world 2!',
      );
      tmpfs.exec('git', ['add', 'test2.txt']);
      tmpfs.exec('git', ['commit', '-m', 'Add test2.txt']);
    });
  });

  describe('in an empty repo', () => {
    beforeEach(() => {
      tmpfs.mock({});
    });

    afterEach(() => {
      tmpfs.restore();
    });

    it('can init', () => {
      tmpfs.gitInit();
    });
  });
});
