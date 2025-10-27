import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import * as tmpfs from '../tmpfs.ts';

afterEach(() => {
  tmpfs.restore();
});

it('creates the files in the temp dir', () => {
  tmpfs.mock({
    'test.txt': 'I like pizza',
    subdir: {
      'test2.txt': 'I like ice cream',
    },
  });

  assert.strictEqual(
    fs.readFileSync(tmpfs.fullPath('test.txt'), 'utf8'),
    'I like pizza',
  );

  assert.strictEqual(
    fs.readFileSync(tmpfs.fullPath('subdir/test2.txt'), 'utf8'),
    'I like ice cream',
  );

  const allFiles = fs.readdirSync(tmpfs.getTempDir());
  assert.deepStrictEqual(allFiles, ['subdir', 'test.txt']);
  assert.deepStrictEqual(fs.readdirSync(tmpfs.fullPath('subdir')), ['test2.txt']);
});

it('throws if called twice without restore', () => {
  tmpfs.mock({});
  assert.throws(
    () => tmpfs.mock({}),
    new Error('tmpfs.mock() called before tmpfs.restore()'),
  );
});

describe('getTempDir', () => {
  it('returns an empty string if no temp dir is set', () => {
    assert.strictEqual(tmpfs.getTempDir(), '');
  });

  it('returns a non-empty string if a temp dir is set', () => {
    tmpfs.mock({});
    assert.match(tmpfs.getTempDir(), /^\/\w+/);
  });
});

describe('fullPath', () => {
  it('returns the full path of a relative path in the temp dir', () => {
    tmpfs.mock({});
    assert.strictEqual(
      tmpfs.fullPath('test.txt'),
      path.join(tmpfs.getTempDir(), 'test.txt'),
    );
  });
});

describe('writeFile', () => {
  it('throws an error if writeFile is called before mock', () => {
    assert.throws(
      () => tmpfs.writeFile('test.txt', 'Hello, world!'),
      new Error('tmpfs.writeFile() called before tmpfs.mock()'),
    );
  });

  describe('after tmpfs mock', () => {
    beforeEach(() => {
      tmpfs.mock({});
    });

    it('throws an error if the filePath starts with a slash', () => {
      assert.throws(
        () => tmpfs.writeFile('/test.txt', 'Hello, world!'),
        new Error('filePath cannot start with a slash'),
      );
    });

    it('throws an error if the filePath contains ..', () => {
      assert.throws(
        () => tmpfs.writeFile('../test.txt', 'Hello, world!'),
        new Error('filePath cannot contain ..'),
      );
    });

    it('writes a file to the temp dir', () => {
      tmpfs.writeFile('test.txt', 'Hello, world!');
      assert.strictEqual(
        fs.readFileSync(tmpfs.fullPath('test.txt'), 'utf8'),
        'Hello, world!',
      );
    });
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

    it('throws an error if the command fails', () => {
      assert.throws(
        () => tmpfs.exec('false'),
        new Error('Command `false` failed:\n\nstderr:\n'),
      );
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

    it('initializes a git repository', () => {
      assert.strictEqual(fs.existsSync(tmpfs.fullPath('.git')), false);

      tmpfs.gitInit();

      assert.strictEqual(fs.existsSync(tmpfs.fullPath('.git')), true);
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

      tmpfs.writeFile('test2.txt', 'Hello, world 2!');
      tmpfs.exec('git', ['add', 'test2.txt']);
      tmpfs.exec('git', ['commit', '-m', 'Add test2.txt']);
    });
  });

  describe('in an empty repo', () => {
    beforeEach(() => {
      tmpfs.mock({});
    });

    it('can init', () => {
      tmpfs.gitInit();
    });
  });
});
