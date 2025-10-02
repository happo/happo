import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type { Mock } from 'node:test';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import * as tmpfs from '../../test-utils/tmpfs.ts';

interface Logger {
  log: Mock<Console['log']>;
  error: Mock<Console['error']>;
}

let logger: Logger;
let main: (argv: Array<string>, logger: Logger) => Promise<void>;
const makeRequestMock: Mock<(url: string, init?: RequestInit) => Promise<unknown>> =
  mock.fn(async () => ({
    statusCode: 200,
    body: { success: true },
  }));

// mock makeRequest.ts *before* importing ../index.ts
mock.module('../../utils/makeRequest.ts', {
  defaultExport: makeRequestMock, // <- default export
});

// Install fresh mocks & imports for each test
beforeEach(async () => {
  logger = {
    log: mock.fn(),
    error: mock.fn(),
  };

  // Now import the SUT; it will see the mocked module
  ({ main } = await import('../index.ts'));

  // Default config file for tests
  tmpfs.mock({
    'happo.config.ts': `
      export default {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        targets: {
          chrome: { browserType: 'chrome', viewport: '1024x768' },
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
        targets: { firefox: { browserType: 'firefox', viewport: '800x600' } },
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
      assert.equal(logger.log.mock.calls[0]?.arguments[0], 'Running happo tests...');
    });

    it('uses custom config file with -c flag', async () => {
      tmpfs.writeFile(
        'custom.config.ts',
        `export default {
        apiKey: 'custom-key',
        apiSecret: 'custom-secret',
        targets: { firefox: { browserType: 'firefox', viewport: '800x600' } },
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
        await main(
          [
            'npx',
            'happo',
            'e2e',
            '--e2ePort',
            process.env.HAPPO_E2E_PORT || '5345',
            '--',
            'touch',
            path.join(tmpfs.getTempDir(), 'happy-to-be-here.txt'),
          ],
          logger,
        );

        assert.strictEqual(process.exitCode, 0);
        assert(logger.log.mock.callCount() >= 1);

        assert.ok(
          fs.statSync(path.join(tmpfs.getTempDir(), 'happy-to-be-here.txt')),
        );
      });

      it('exits with the exit code of the command', async () => {
        await main(
          [
            'npx',
            'happo',
            'e2e',
            '--e2ePort',
            process.env.HAPPO_E2E_PORT || '5345',
            '--',
            'ls',
            path.join(tmpfs.getTempDir(), 'non-existent.txt'),
          ],
          logger,
        );

        // ls exits 1 on mac, but 2 in CI. Good enough to just assert that it's
        // not 0 here.
        assert.notStrictEqual(process.exitCode, 0);
        assert(logger.log.mock.callCount() >= 1);
      });

      it('fails to finalize when HAPPO_NONCE is not set', async () => {
        await main(['npx', 'happo', 'e2e', 'finalize'], logger);
        assert.equal(process.exitCode, 1);
        assert(logger.error.mock.callCount() >= 1);
        assert.match(
          logger.error.mock.calls[0]?.arguments[0],
          /Missing HAPPO_NONCE environment variable/,
        );
      });

      it('can finalize a report with a HAPPO_NONCE', async () => {
        try {
          process.env.HAPPO_NONCE = 'test-nonce';

          process.env.HAPPO_PREVIOUS_SHA = 'test-sha';
          process.env.HAPPO_CURRENT_SHA = 'test-sha';

          await main(['npx', 'happo', 'e2e', 'finalize'], logger);
          if (process.exitCode !== 0) {
            console.log('process.exitCode', process.exitCode);
            console.log('logger.log.mock.calls', logger.log.mock.calls);
            console.log('logger.error.mock.calls', logger.error.mock.calls);
          }
          assert.equal(process.exitCode, 0);
          assert(makeRequestMock.mock.callCount() > 0);
        } finally {
          delete process.env.HAPPO_NONCE;
          delete process.env.HAPPO_PREVIOUS_SHA;
          delete process.env.HAPPO_CURRENT_SHA;
        }
      });
    });
  });
});
