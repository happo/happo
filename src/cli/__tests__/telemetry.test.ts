import assert from 'node:assert';
import { describe, it } from 'node:test';

import { createReporter, detectCI, parseDsn, parseFrames } from '../telemetry.ts';

describe('telemetry', () => {
  describe('detectCI', () => {
    it('detects GitHub Actions', () => {
      assert.deepStrictEqual(
        detectCI({
          GITHUB_ACTIONS: 'true',
        }),
        'github',
      );
    });

    it('detects CircleCI', () => {
      assert.deepStrictEqual(
        detectCI({
          CIRCLECI: 'true',
        }),
        'circleci',
      );
    });

    it('detects Travis CI', () => {
      assert.deepStrictEqual(
        detectCI({
          TRAVIS: 'true',
        }),
        'travis',
      );
    });

    it('detects Azure Pipelines', () => {
      assert.deepStrictEqual(
        detectCI({
          TF_BUILD: 'true',
        }),
        'azure',
      );
    });
  });

  describe('parseDsn', () => {
    it('parses a DSN', () => {
      const dsn = 'https://public-key@host/project-id';
      const parsed = parseDsn(dsn);
      assert.deepStrictEqual(parsed, {
        host: 'host',
        projectId: 'project-id',
        key: 'public-key',
        protocol: 'https',
      });
    });
  });

  describe('parseFrames', () => {
    it('returns an array of Sentry frames', async () => {
      const stack = `Error: testing
    at funcName (file:///Users/username/repo/path/file.js:10:5)
    at bound (node:foo/bar:433:15)
    at funcName2 (file:///Users/username/repo/path/file2.js:20:10)
    at funcName3 (file:///Users/username/repo/path/file3.js:30:15)
    at new Foo (file:///Users/username/repo/path/subdir/foo.js:1:1)`;

      const frames = await parseFrames(stack, '/Users/username/repo');

      assert.deepStrictEqual(frames, [
        {
          function: 'new Foo',
          raw_function: 'new Foo',
          abs_path: 'path/subdir/foo.js',
          filename: 'foo.js',
          lineno: 1,
          colno: 1,
        },
        {
          function: 'funcName3',
          raw_function: 'funcName3',
          abs_path: 'path/file3.js',
          filename: 'file3.js',
          lineno: 30,
          colno: 15,
        },
        {
          function: 'funcName2',
          raw_function: 'funcName2',
          abs_path: 'path/file2.js',
          filename: 'file2.js',
          lineno: 20,
          colno: 10,
        },
        {
          function: 'bound',
          raw_function: 'bound',
          abs_path: 'node:foo/bar',
          filename: 'node:foo/bar',
          lineno: 433,
          colno: 15,
        },
        {
          function: 'funcName',
          raw_function: 'funcName',
          abs_path: 'path/file.js',
          filename: 'file.js',
          lineno: 10,
          colno: 5,
        },
      ]);
    });
  });

  describe('createReporter', () => {
    it('creates a reporter', () => {
      const reporter = createReporter();
      assert.strictEqual(typeof reporter.captureException, 'function');
    });

    it('can capture exceptions', async () => {
      const reporter = createReporter();
      await reporter.captureException(
        new Error('Test error from happo package test suite'),
      );
    });
  });
});
