import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { describe, it } from 'node:test';

const isWindows = process.platform === 'win32';

describe('main', () => {
  // Shebangs don't work on Windows at all, so skip this test on windows.
  (isWindows ? it.skip : it)(
    'is directly executable from the command line (shebang works)',
    () => {
      let message: string = '';

      try {
        execSync('./src/cli/main.ts', { stdio: 'pipe' });
      } catch (error) {
        message = String(error);
      }

      assert.match(message, /Happo config file could not be found/);
      assert.doesNotMatch(message, /command not found/);
      assert.doesNotMatch(message, /syntax error/);
    },
  );
});
