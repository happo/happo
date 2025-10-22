import assert from 'node:assert';
import fs from 'node:fs';
import type { Mock } from 'node:test';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import * as tmpfs from '../../test-utils/tmpfs.ts';
import type makeRequest from '../../utils/makeRequest.ts';

interface Logger {
  log: Mock<Console['log']>;
  error: Mock<Console['error']>;
}

let logger: Logger;
let main: (argv: Array<string>, logger: Logger) => Promise<void>;
const makeRequestMock: Mock<typeof makeRequest> = mock.fn(async () => ({
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
        integrationType: 'cypress',
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
        integrationType: 'cypress',
        apiKey: 'custom-key',
        apiSecret: 'custom-secret',
        targets: { firefox: { browserType: 'firefox', viewport: '800x600' } },
      };`,
      );

      await main(
        ['npx', 'happo', '--config', tmpfs.fullPath('custom.config.ts')],
        logger,
      );

      assert.ok(logger.log.mock.callCount() >= 3);
      assert.equal(logger.log.mock.calls[0]?.arguments[0], 'Running happo tests...');
    });

    it('uses custom config file with -c flag', async () => {
      tmpfs.writeFile(
        'custom.config.ts',
        `export default {
        integrationType: 'cypress',
        apiKey: 'custom-key',
        apiSecret: 'custom-secret',
        targets: { firefox: { browserType: 'firefox', viewport: '800x600' } },
      };`,
      );

      await main(['npx', 'happo', '-c', tmpfs.fullPath('custom.config.ts')], logger);

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
            ['npx', 'happo', '--config', tmpfs.fullPath('non-existent.config.ts')],
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
            tmpfs.fullPath('happy-to-be-here.txt'),
          ],
          logger,
        );

        assert.strictEqual(process.exitCode, 0);
        assert(logger.log.mock.callCount() >= 1);

        assert.ok(fs.statSync(tmpfs.fullPath('happy-to-be-here.txt')));
      });

      it('fails when integration type is not supported', async () => {
        tmpfs.writeFile(
          'happo.config.ts',
          `export default {
            integrationType: 'storybook',
          };`,
        );
        await main(['npx', 'happo', 'e2e', '--', 'echo', 'hello'], logger);
        assert.strictEqual(process.exitCode, 1);
        assert(logger.error.mock.callCount() >= 1);
        const errorMessage = logger.error.mock.calls[0]?.arguments[0];
        assert.match(
          errorMessage,
          /Unsupported integration type used for e2e command: storybook/,
        );
        assert.match(errorMessage, /Supported.*cypress.*playwright/);
      });

      it('passes along an environment variable for loading the happo config', async () => {
        tmpfs.writeFile(
          'my-happo-config.ts',
          "export default { integrationType: 'cypress', apiKey: 'test-key', apiSecret: 'test-secret' };",
        );
        tmpfs.writeFile(
          'overwrite-happo-config.js',
          `const fs = require('fs');
          fs.writeFileSync(process.env.HAPPO_CONFIG_FILE, 'changed it!');
          `,
        );
        await main(
          [
            'npx',
            'happo',
            'e2e',
            '--e2ePort',
            process.env.HAPPO_E2E_PORT || '5345',
            '--config',
            tmpfs.fullPath('my-happo-config.ts'),
            '--',
            'node',
            tmpfs.fullPath('overwrite-happo-config.js'),
          ],
          logger,
        );

        assert.strictEqual(process.exitCode, 0);

        const fileContents = fs.readFileSync(
          tmpfs.fullPath('my-happo-config.ts'),
          'utf8',
        );
        assert.strictEqual(fileContents, 'changed it!');
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
            tmpfs.fullPath('non-existent.txt'),
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

      describe('cancelling the Happo job', () => {
        beforeEach(() => {
          process.env.HAPPO_PREVIOUS_SHA = 'foobar';
          process.env.HAPPO_CURRENT_SHA = 'barfoo';
        });

        it('cancels the Happo job when the command fails', async () => {
          await main(
            ['npx', 'happo', 'e2e', '--', 'ls', tmpfs.fullPath('non-existent.txt')],
            logger,
          );
          assert.notStrictEqual(process.exitCode, 0);
          assert(makeRequestMock.mock.callCount() > 0);

          const cancelRequest = makeRequestMock.mock.calls.at(-1);
          if (!cancelRequest) {
            throw new Error('No cancel request found');
          }
          assert.strictEqual(
            cancelRequest.arguments[0]?.url,
            'https://happo.io/api/jobs/foobar/barfoo/cancel',
          );
          assert.strictEqual(
            (cancelRequest.arguments[0]?.body as { message: string })?.message,
            'cypress run failed',
          );
        });
        afterEach(() => {
          delete process.env.HAPPO_PREVIOUS_SHA;
          delete process.env.HAPPO_CURRENT_SHA;
        });
      });
    });
  });
});
