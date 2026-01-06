import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { describe, it } from 'node:test';

describe('main', () => {
  it('is directly executable from the command line', () => {
    let message: string = '';

    try {
      execSync('./src/cli/main.ts', { stdio: 'pipe' });
    } catch (error) {
      message = String(error);
    }

    assert.match(message, /Happo config file could not be found/);
    assert.doesNotMatch(message, /command not found/);
    assert.doesNotMatch(message, /syntax error/);
  });
});
