import assert from 'node:assert';
import path from 'node:path';
import type { Mock } from 'node:test';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import * as tmpfs from '../../test-utils/tmpfs.ts';
import { main } from '../index.ts';

interface Logger {
  log: Mock<Console['log']>;
  error: Mock<Console['error']>;
}

let logger: Logger;

beforeEach(() => {
  logger = {
    log: mock.fn(),
    error: mock.fn(),
  };

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
});

afterEach(() => {
  tmpfs.restore();

  // Restore original values
  process.exitCode = undefined;
});

describe('main', () => {
  describe('version flags', () => {
    it('shows version with --version flag', async () => {
      await main(['npx', 'happo', '--version'], logger);

      assert.strictEqual(logger.log.mock.callCount(), 1);
      assert.strictEqual(logger.log.mock.calls[0]?.arguments[0], '1.0.0');
    });

    it('shows version with -v flag', async () => {
      await main(['npx', 'happo', '-v'], logger);

      assert.strictEqual(logger.log.mock.callCount(), 1);
      assert.strictEqual(logger.log.mock.calls[0]?.arguments[0], '1.0.0');
    });
  });

  describe('help flags', () => {
    it('shows help with --help flag', async () => {
      await main(['npx', 'happo', '--help'], logger);

      assert.strictEqual(logger.log.mock.callCount(), 1);
      const helpText = logger.log.mock.calls[0]?.arguments[0];
      assert.ok(helpText.includes('Happo 1.0.0'));
      assert.ok(helpText.includes('Usage: happo [command]'));
      assert.ok(helpText.includes('e2e'));
      assert.ok(helpText.includes('test'));
      assert.ok(helpText.includes('version'));
    });

    it('shows help with -h flag', async () => {
      await main(['npx', 'happo', '-h'], logger);

      assert.strictEqual(logger.log.mock.callCount(), 1);
      const helpText = logger.log.mock.calls[0]?.arguments[0];
      assert.ok(helpText.includes('Happo 1.0.0'));
    });
  });

  describe('config flag', () => {
    it('uses custom config file with --config flag', async () => {
      tmpfs.writeFile(
        'custom.config.ts',
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

      await main(
        [
          'npx',
          'happo',
          '--config',
          path.join(tmpfs.getTempDir(), 'custom.config.ts'),
        ],
        logger,
      );

      assert.ok(logger.log.mock.callCount() >= 3);
      assert.strictEqual(
        logger.log.mock.calls[0]?.arguments[0],
        'Running happo tests...',
      );
    });

    it('uses custom config file with -c flag', async () => {
      tmpfs.writeFile(
        'custom.config.ts',
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

      await main(
        ['npx', 'happo', '-c', path.join(tmpfs.getTempDir(), 'custom.config.ts')],
        logger,
      );

      assert.ok(logger.log.mock.callCount() >= 3);
      assert.strictEqual(
        logger.log.mock.calls[0]?.arguments[0],
        'Running happo tests...',
      );
    });

    it('uses default config file when no --config flag', async () => {
      await main(['npx', 'happo'], logger);

      assert.ok(logger.log.mock.callCount() >= 3);
      assert.strictEqual(
        logger.log.mock.calls[0]?.arguments[0],
        'Running happo tests...',
      );
    });

    it('fails when config file does not exist', async () => {
      await assert.rejects(
        () =>
          main(
            [
              'npx',
              'happo',
              '--config',
              path.join(tmpfs.getTempDir(), 'non-existent.config.ts'),
            ],
            logger,
          ),
        /Cannot find module .*non-existent.config.ts/,
      );
    });
  });

  describe('commands', () => {
    it('runs default command when no positional args', async () => {
      await main(['npx', 'happo'], logger);

      assert.ok(logger.log.mock.callCount() >= 3);
      assert.strictEqual(
        logger.log.mock.calls[0]?.arguments[0],
        'Running happo tests...',
      );
      assert.strictEqual(logger.log.mock.calls[1]?.arguments[0], 'Config:');
      assert.strictEqual(logger.log.mock.calls[2]?.arguments[0], 'Environment:');
    });

    it('shows error for unknown command', async () => {
      await main(['npx', 'happo', 'unknown-command'], logger);

      assert.strictEqual(logger.error.mock.callCount(), 2);
      assert.strictEqual(
        logger.error.mock.calls[0]?.arguments[0],
        'Unknown command: unknown-command\n',
      );
      assert.ok(logger.error.mock.calls[1]?.arguments[0].includes('Happo 1.0.0'));
      assert.strictEqual(process.exitCode, 1);
    });

    describe('e2e command', () => {
      it('fails when no dashdash is provided', async () => {
        await main(['npx', 'happo', 'e2e'], logger);

        assert(logger.error.mock.callCount() >= 1);
        assert.match(
          logger.error.mock.calls[0]?.arguments[0],
          /Missing command for e2e action/,
        );
        assert.strictEqual(process.exitCode, 1);
      });

      it('fails when no command is provided', async () => {
        await main(['npx', 'happo', 'e2e', '--'], logger);

        assert(logger.error.mock.callCount() >= 1);
        assert.match(
          logger.error.mock.calls[0]?.arguments[0],
          /Missing command for e2e action/,
        );
        assert.strictEqual(process.exitCode, 1);
      });

      it('runs command when provided', async () => {
        await main(['npx', 'happo', 'e2e', '--', 'echo', 'hello'], logger);

        assert(logger.log.mock.callCount() >= 1);
        assert.match(
          logger.log.mock.calls[0]?.arguments[0],
          /Setting up happo wrapper/,
        );
      });
    });
  });
});
