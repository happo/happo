import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it, mock } from 'node:test';

// A path under node_modules so that buildStorybook() treats it as the binary
// to spawn directly, and one that does not exist so that spawning it fails.
const MISSING_BINARY = path.join(
  os.tmpdir(),
  'happo-no-such-project',
  'node_modules',
  '.bin',
  'storybook',
);

mock.module('../getStorybookBuildCommandParts.ts', {
  defaultExport: () => [MISSING_BINARY, 'build'],
});

const { default: buildStorybookPackage } = await import('../index.ts');

const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'happo-spawn-test-'));

after(() => {
  fs.rmSync(outputDir, { recursive: true, force: true });
});

async function buildAndCatch(): Promise<Error> {
  let error: Error | null = null;
  try {
    await buildStorybookPackage({ outputDir });
  } catch (e) {
    error = e as Error;
  }

  assert.ok(error, 'expected buildStorybookPackage to reject');
  return error;
}

describe('when the Storybook build command cannot be spawned', () => {
  it('rejects instead of taking the whole process down', async () => {
    // Regression test: with no 'error' listener on the child process, an
    // unspawnable binary surfaced as an unhandled 'error' event and an
    // uncaught exception. That escaped the CLI's catch block, so the Happo
    // job was never cancelled and hung in the queue with no message at all.
    //
    // How we get here is platform-dependent (see below), so this only asserts
    // what has to hold either way: we reject, and we name the command, since
    // "it would not run" is only actionable once you know what "it" was.
    const error = await buildAndCatch();

    assert.match(error.message, /storybook build/);
  });

  // On Windows the command is spawned through a shell, so cmd.exe starts
  // successfully and reports the missing binary itself -- an ordinary exit
  // code 1, not a spawn failure. The 'error' event this covers is only
  // reachable where we spawn the binary directly.
  it(
    'says the command could not be run at all',
    { skip: process.platform === 'win32' },
    async () => {
      const error = await buildAndCatch();

      assert.match(error.message, /Could not run the Storybook build command/);
      assert.match(error.message, /ENOENT/);
    },
  );

  it(
    'reports what the shell said when the shell is the one that fails',
    { skip: process.platform !== 'win32' },
    async () => {
      const error = await buildAndCatch();

      assert.match(error.message, /exited with code 1/);
      // cmd.exe's own complaint is the only explanation available here, so
      // the captured output is what makes this message worth anything.
      assert.match(error.message, /Storybook printed this before it stopped/);
    },
  );
});
