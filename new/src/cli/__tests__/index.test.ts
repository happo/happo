import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import * as tmpfs from '../../test-utils/tmpfs.ts';
import { main } from '../index.ts';

// Mock process.exit
const originalExit = process.exit;

beforeEach(() => {
  // Create a mock config file
  tmpfs.mock({
    'happo.config.ts': `
      export default {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        targets: {
          chrome: {
            browserType: 'chrome',
            viewport: '1024x768',
          },
        },
      };
    `,
  });

  // Mock process.exit to prevent actual exit
  process.exit = mock.fn() as typeof process.exit;
});

afterEach(() => {
  tmpfs.restore();

  // Restore original values
  process.exit = originalExit;

  // Silence console methods
  mock.method(console, 'log', () => {});
  mock.method(console, 'error', () => {});
});

describe('main', () => {
  describe('version flags', () => {
    it('shows version with --version flag', async () => {
      const consoleLog = mock.method(console, 'log', () => {});
      await main(['npx', 'happo', '--version']);

      assert.strictEqual(consoleLog.mock.callCount(), 1);
      assert.strictEqual(consoleLog.mock.calls[0]?.arguments[0], '1.0.0');
    });

    it('shows version with -v flag', async () => {
      const consoleLog = mock.method(console, 'log', () => {});
      await main(['npx', 'happo', '-v']);

      assert.strictEqual(consoleLog.mock.callCount(), 1);
      assert.strictEqual(consoleLog.mock.calls[0]?.arguments[0], '1.0.0');
    });
  });

  describe('help flags', () => {
    it('shows help with --help flag', async () => {
      const consoleLog = mock.method(console, 'log', () => {});
      await main(['npx', 'happo', '--help']);

      assert.strictEqual(consoleLog.mock.callCount(), 1);
      const helpText = consoleLog.mock.calls[0]?.arguments[0];
      assert.ok(helpText.includes('Happo 1.0.0'));
      assert.ok(helpText.includes('Usage: happo [command]'));
      assert.ok(helpText.includes('e2e'));
      assert.ok(helpText.includes('test'));
      assert.ok(helpText.includes('version'));
    });

    it('shows help with -h flag', async () => {
      const consoleLog = mock.method(console, 'log', () => {});
      await main(['npx', 'happo', '-h']);

      assert.strictEqual(consoleLog.mock.callCount(), 1);
      const helpText = consoleLog.mock.calls[0]?.arguments[0];
      assert.ok(helpText.includes('Happo 1.0.0'));
    });
  });

  describe('config flag', () => {
    it('uses custom config file with --config flag', async () => {
      fs.writeFileSync(
        path.join(tmpfs.getTempDir(), 'custom.config.ts'),
        `export default {
  apiKey: 'custom-key',
  apiSecret: 'custom-secret',
  targets: {
    firefox: {
      browserType: 'firefox',
      viewport: '800x600',
    },
  },
};`,
      );

      const consoleLog = mock.method(console, 'log', () => {});

      await main([
        'npx',
        'happo',
        '--config',
        path.join(tmpfs.getTempDir(), 'custom.config.ts'),
      ]);

      assert.ok(consoleLog.mock.callCount() >= 3);
      assert.strictEqual(
        consoleLog.mock.calls[0]?.arguments[0],
        'Running happo tests...',
      );
    });

    it('uses custom config file with -c flag', async () => {
      fs.writeFileSync(
        path.join(tmpfs.getTempDir(), 'custom.config.ts'),
        `export default {
  apiKey: 'custom-key',
  apiSecret: 'custom-secret',
  targets: {
    firefox: {
      browserType: 'firefox',
      viewport: '800x600',
    },
  },
};`,
      );

      const consoleLog = mock.method(console, 'log', () => {});
      await main([
        'npx',
        'happo',
        '-c',
        path.join(tmpfs.getTempDir(), 'custom.config.ts'),
      ]);

      assert.ok(consoleLog.mock.callCount() >= 3);
      assert.strictEqual(
        consoleLog.mock.calls[0]?.arguments[0],
        'Running happo tests...',
      );
    });

    it('uses default config file when no --config flag', async () => {
      const consoleLog = mock.method(console, 'log', () => {});
      await main(['npx', 'happo']);

      assert.ok(consoleLog.mock.callCount() >= 3);
      assert.strictEqual(
        consoleLog.mock.calls[0]?.arguments[0],
        'Running happo tests...',
      );
    });

    it('fails when config file does not exist', async () => {
      await assert.rejects(
        () =>
          main([
            'npx',
            'happo',
            '--config',
            path.join(tmpfs.getTempDir(), 'non-existent.config.ts'),
          ]),
        /Cannot find module .*non-existent.config.ts/,
      );
    });
  });

  describe('commands', () => {
    it('runs default command when no positional args', async () => {
      const consoleLog = mock.method(console, 'log', () => {});
      await main(['npx', 'happo']);

      assert.ok(consoleLog.mock.callCount() >= 3);
      assert.strictEqual(
        consoleLog.mock.calls[0]?.arguments[0],
        'Running happo tests...',
      );
      assert.strictEqual(consoleLog.mock.calls[1]?.arguments[0], 'Config:');
      assert.strictEqual(consoleLog.mock.calls[2]?.arguments[0], 'Environment:');
    });

    it('runs e2e command', async () => {
      const consoleLog = mock.method(console, 'log', () => {});
      await main(['npx', 'happo', 'e2e']);

      assert.ok(consoleLog.mock.callCount() >= 3);
      assert.strictEqual(
        consoleLog.mock.calls[0]?.arguments[0],
        'Setting up happo wrapper for Cypress and Playwright...',
      );
      assert.strictEqual(consoleLog.mock.calls[1]?.arguments[0], 'Config:');
      assert.strictEqual(consoleLog.mock.calls[2]?.arguments[0], 'Environment:');
    });

    it('shows error for unknown command', async () => {
      const consoleError = mock.method(console, 'error', () => {});
      await main(['npx', 'happo', 'unknown-command']);

      assert.strictEqual(consoleError.mock.callCount(), 2);
      assert.strictEqual(
        consoleError.mock.calls[0]?.arguments[0],
        'Unknown command: unknown-command\n',
      );
      assert.ok(consoleError.mock.calls[1]?.arguments[0].includes('Happo 1.0.0'));
      assert.strictEqual(
        (
          process.exit as typeof process.exit & {
            mock: { callCount(): number; calls: Array<{ arguments: [number] }> };
          }
        ).mock.callCount(),
        1,
      );
      assert.strictEqual(
        (
          process.exit as typeof process.exit & {
            mock: { callCount(): number; calls: Array<{ arguments: [number] }> };
          }
        ).mock.calls[0]?.arguments[0],
        1,
      );
    });
  });
});
