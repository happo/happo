import assert from 'node:assert';
import http from 'node:http';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';

import * as tmpfs from '../../test-utils/tmpfs.ts';
import { findConfigFile, loadConfigFile } from '../loadConfig.ts';

const originalEnv = { ...process.env };

async function startPullRequestTokenServer(
  responses: Array<{ status: number; body: unknown }>,
): Promise<{
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}> {
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/pull-request-token') {
      // Use the last response if no response is found for the current request
      const response = responses[requestCount] || responses.at(-1);

      if (!response) {
        throw new Error('No response found');
      }

      requestCount++;

      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response.body));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server port');
  }
  const port = address.port;

  return {
    server,
    port,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

afterEach(() => {
  tmpfs.restore();
  process.env = {
    ...originalEnv,
  };
  delete process.env.HAPPO_API_KEY;
  delete process.env.HAPPO_API_SECRET;
});

describe('findConfigFile', () => {
  it('finds happo.config.js', () => {
    tmpfs.mock({
      'happo.config.js': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.strictEqual(path.basename(foundConfigFile), 'happo.config.js');
  });

  it('finds happo.config.mjs', () => {
    tmpfs.mock({
      'happo.config.mjs': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.strictEqual(path.basename(foundConfigFile), 'happo.config.mjs');
  });

  it('finds happo.config.cjs', () => {
    tmpfs.mock({
      'happo.config.cjs': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.strictEqual(path.basename(foundConfigFile), 'happo.config.cjs');
  });

  it('finds happo.config.ts', () => {
    tmpfs.mock({
      'happo.config.ts': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.strictEqual(path.basename(foundConfigFile), 'happo.config.ts');
  });

  it('finds happo.config.mts', () => {
    tmpfs.mock({
      'happo.config.mts': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.strictEqual(path.basename(foundConfigFile), 'happo.config.mts');
  });

  it('finds happo.config.cts', () => {
    tmpfs.mock({
      'happo.config.cts': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.strictEqual(path.basename(foundConfigFile), 'happo.config.cts');
  });

  it('finds the config file in a parent directory', () => {
    const tmpDir = tmpfs.mock({
      'happo.config.ts': '',
      projects: {
        pizza: {
          'index.ts': '',
        },
      },
    });

    process.chdir(`${tmpDir}/projects/pizza`);

    const foundConfigFile = findConfigFile();
    assert.ok(foundConfigFile);
    assert.strictEqual(foundConfigFile, path.join(tmpDir, 'happo.config.ts'));
  });

  it('finds the config file in a subdirectory', () => {
    const tmpDir = tmpfs.mock({
      'happo.config.ts': '',
      projects: {
        pizza: {
          'happo.config.ts': '',
          'index.ts': '',
        },
      },
    });

    process.chdir(`${tmpDir}/projects/pizza`);

    const foundConfigFile = findConfigFile();
    assert.ok(foundConfigFile);
    assert.strictEqual(
      foundConfigFile,
      path.join(tmpDir, 'projects', 'pizza', 'happo.config.ts'),
    );
  });

  it('finds the config file in a subdirectory with a different extension', () => {
    const tmpDir = tmpfs.mock({
      'happo.config.js': '',
      projects: {
        pizza: {
          'happo.config.ts': '',
          'index.ts': '',
        },
      },
    });

    process.chdir(`${tmpDir}/projects/pizza`);

    const foundConfigFile = findConfigFile();
    assert.ok(foundConfigFile);
    assert.strictEqual(
      foundConfigFile,
      path.join(tmpDir, 'projects', 'pizza', 'happo.config.ts'),
    );
  });

  it('throws an error if no config file is found', () => {
    tmpfs.mock({});

    assert.throws(() => {
      findConfigFile();
    }, /Happo config file could not be found/);
  });

  it('uses the HAPPO_CONFIG_FILE environment variable if it is set', () => {
    tmpfs.mock({
      'happo.config.ts':
        'export default { apiKey: "test-api-key", apiSecret: "test-api-secret" };',
    });

    process.env.HAPPO_CONFIG_FILE = 'my-happo.config.ts';
    const foundConfigFile = findConfigFile();
    assert.ok(foundConfigFile);
    assert.strictEqual(foundConfigFile, process.env.HAPPO_CONFIG_FILE);
  });
});

describe('loadConfigFile', () => {
  it('throws a helpful error if the config file is using an extension that is not supported by this version of Node.js', async () => {
    tmpfs.mock({
      // We run our tests in versions we support, so let's just use a totally
      // different extension here for this test. This wouldn't normally happen
      // because it wouldn't be found by findConfigFile.
      'happo.config.py': '',
    });

    await assert.rejects(
      loadConfigFile(tmpfs.fullPath('happo.config.py'), {
        link: undefined,
        ci: false,
      }),
      /Your Happo config file \S+ is using an extension that is not supported by this version of Node.js \(\.py\)/,
    );
  });

  it('throws a helpful error if the config file exports undefined', async () => {
    tmpfs.mock({
      'happo.config.ts': `export default undefined;`,
    });

    await assert.rejects(
      loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
      /Your Happo config file \S+ must have a default export that is an object, got: undefined/,
    );
  });

  it('throws a helpful error if the config file exports null', async () => {
    tmpfs.mock({
      'happo.config.ts': `export default null;`,
    });

    await assert.rejects(
      loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
      /Your Happo config file \S+ must have a default export that is an object, got: null/,
    );
  });

  it('throws a helpful error if the config file exports an array', async () => {
    tmpfs.mock({
      'happo.config.ts': `export default [];`,
    });

    await assert.rejects(
      loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
      /Your Happo config file \S+ must have a default export that is an object, got: array/,
    );
  });

  it('throws a helpful error if the config file exports a boolean', async () => {
    tmpfs.mock({
      'happo.config.ts': `export default true;`,
    });

    await assert.rejects(
      loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
      /Your Happo config file \S+ must have a default export that is an object, got: boolean/,
    );
  });

  it('throws a helpful error if the config file exports a number', async () => {
    tmpfs.mock({
      'happo.config.ts': `export default 42;`,
    });

    await assert.rejects(
      loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
      /Your Happo config file \S+ must have a default export that is an object, got: number/,
    );
  });

  it('throws a helpful error if the config file exports a string', async () => {
    tmpfs.mock({
      'happo.config.ts': `export default 'test-string';`,
    });

    await assert.rejects(
      loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
      /Your Happo config file \S+ must have a default export that is an object, got: string/,
    );
  });

  it('throws a helpful error if the config file exports a symbol', async () => {
    tmpfs.mock({
      'happo.config.ts': `export default Symbol('test-symbol');`,
    });

    await assert.rejects(
      loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
      /Your Happo config file \S+ must have a default export that is an object, got: symbol/,
    );
  });

  it('throws a helpful error if the config file exports a function', async () => {
    tmpfs.mock({
      'happo.config.ts': `export default function() {};`,
    });

    await assert.rejects(
      loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
      /Your Happo config file \S+ must have a default export that is an object, got: function/,
    );
  });

  it('throws an error if the apiKey is missing', async () => {
    tmpfs.mock({
      'happo.config.ts': `
        export default {
          apiSecret: 'test-api-secret',
        };
      `,
    });

    await assert.rejects(
      loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
      /Missing `apiKey` in your Happo config/,
    );
  });

  it('throws an error if the apiSecret is missing', async () => {
    tmpfs.mock({
      'happo.config.ts': `
        export default {
          apiKey: 'test-api-key',
        };
      `,
    });

    await assert.rejects(
      loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
      /Missing `apiSecret` in your Happo config/,
    );
  });

  it('uses the HAPPO_API_KEY environment variable if it is set', async () => {
    tmpfs.mock({
      'happo.config.ts': `
        export default {
          apiSecret: 'test-api-secret',
        };
      `,
    });

    process.env.HAPPO_API_KEY = 'test-api-key';
    const config = await loadConfigFile(findConfigFile(), {
      link: undefined,
      ci: false,
    });
    assert.ok(config);
    assert.strictEqual(config.apiKey, 'test-api-key');
    assert.strictEqual(config.apiSecret, 'test-api-secret');
  });

  it('uses the HAPPO_API_SECRET environment variable if it is set', async () => {
    tmpfs.mock({
      'happo.config.ts': `
        export default {
          apiKey: 'test-api-key',
        };
      `,
    });

    process.env.HAPPO_API_SECRET = 'test-api-secret';
    const config = await loadConfigFile(findConfigFile(), {
      link: undefined,
      ci: false,
    });
    assert.ok(config);
    assert.strictEqual(config.apiKey, 'test-api-key');
    assert.strictEqual(config.apiSecret, 'test-api-secret');
  });

  it('uses pull-request authentication from the environment link if the apiKey and apiSecret are missing', async () => {
    const testSecret = 'test-pull-request-secret';
    const { port, close } = await startPullRequestTokenServer([
      { status: 200, body: { secret: testSecret } },
    ]);

    try {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            endpoint: 'http://localhost:${port}',
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: 'https://github.com/happo/happo/pull/123',
        ci: false,
      });

      assert.ok(config);
      assert.strictEqual(config.apiKey, 'https://github.com/happo/happo/pull/123');
      assert.strictEqual(config.apiSecret, testSecret);
    } finally {
      await close();
    }
  });

  it('retries pull-request authentication requests that fail initially', async () => {
    const testSecret = 'test-pull-request-secret';
    const { port, close } = await startPullRequestTokenServer([
      { status: 500, body: { error: 'Internal Server Error' } },
      { status: 200, body: { secret: testSecret } },
    ]);

    try {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            endpoint: 'http://localhost:${port}',
          };
        `,
      });

      const logger = {
        log: mock.fn(),
        error: mock.fn(),
      };
      const config = await loadConfigFile(
        findConfigFile(),
        {
          link: 'https://github.com/happo/happo/pull/123',
          ci: false,
        },
        logger,
      );

      assert.ok(config);
      assert.strictEqual(config.apiKey, 'https://github.com/happo/happo/pull/123');
      assert.strictEqual(config.apiSecret, testSecret);
      assert.match(logger.error.mock.calls[0]?.arguments[0], /Retrying/);
    } finally {
      await close();
    }
  });

  it('uses pull-request authentication from the environment link if the apiKey is missing', async () => {
    const testSecret = 'test-pull-request-secret';
    const { port, close } = await startPullRequestTokenServer([
      { status: 200, body: { secret: testSecret } },
    ]);

    try {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            endpoint: 'http://localhost:${port}',
            apiSecret: 'test-api-secret',
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: 'https://github.com/happo/happo/pull/123',
        ci: false,
      });

      assert.ok(config);
      assert.strictEqual(config.apiKey, 'https://github.com/happo/happo/pull/123');
      assert.strictEqual(config.apiSecret, testSecret);
    } finally {
      await close();
    }
  });

  it('uses pull-request authentication from the environment link if the apiSecret is missing', async () => {
    const testSecret = 'test-pull-request-secret';
    const { port, close } = await startPullRequestTokenServer([
      { status: 200, body: { secret: testSecret } },
    ]);

    try {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            endpoint: 'http://localhost:${port}',
            apiKey: 'test-api-key',
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: 'https://github.com/happo/happo/pull/123',
        ci: false,
      });

      assert.ok(config);
      assert.strictEqual(config.apiKey, 'https://github.com/happo/happo/pull/123');
      assert.strictEqual(config.apiSecret, testSecret);
    } finally {
      await close();
    }
  });

  it('rejects with an error if the pull-request authentication fails', async () => {
    const logger = {
      log: mock.fn(),
      error: mock.fn(),
    };
    tmpfs.mock({
      'happo.config.ts': `
        export default {
          endpoint: 'http://localhost:123456',
        };
      `,
    });

    await assert.rejects(
      loadConfigFile(
        findConfigFile(),
        {
          link: 'https://github.com/happo/happo/pull/123',
          ci: false,
        },
        logger,
      ),
      /Missing `apiKey` and `apiSecret` in your Happo config/,
    );
    assert.match(
      logger.log.mock.calls[1]?.arguments[0],
      /Failed to obtain temporary pull-request token/,
    );
  });

  it('loads the config file', async () => {
    tmpfs.mock({
      'happo.config.ts': `
        export default {
          apiKey: "test-api-key",
          apiSecret: "test-api-secret"
        };
      `,
    });

    const config = await loadConfigFile(findConfigFile(), {
      link: undefined,
      ci: false,
    });

    assert.ok(config);
    assert.strictEqual(config.apiKey, 'test-api-key');
    assert.strictEqual(config.apiSecret, 'test-api-secret');
  });

  it('sets the default values for the targets', async () => {
    tmpfs.mock({
      'happo.config.ts': `
        export default {
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        };
      `,
    });

    const config = await loadConfigFile(findConfigFile(), {
      link: undefined,
      ci: false,
    });

    assert.ok(config);
    assert.strictEqual(config.endpoint, 'https://happo.io');
    assert.strictEqual(config.githubApiUrl, 'https://api.github.com');
    assert.strictEqual(config.integration?.type, 'storybook');
    assert.deepStrictEqual(config.targets, {
      chrome: {
        type: 'chrome',
        viewport: '1024x768',
        freezeAnimations: 'last-frame',
        prefersReducedMotion: true,
        allowPointerEvents: true,
      },
    });
  });

  it('gives each load its own default targets and integration', async () => {
    tmpfs.mock({
      'happo.config.ts': `
        export default {
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        };
      `,
    });

    const first = await loadConfigFile(findConfigFile(), {
      link: undefined,
      ci: false,
    });
    // e.g. what e2e/controller.ts does with dynamic targets
    first.targets.dynamic = {
      type: 'firefox',
      viewport: '800x600',
      __dynamic: true,
    };
    if (first.targets.chrome) {
      first.targets.chrome.viewport = '1x1';
    }

    const second = await loadConfigFile(findConfigFile(), {
      link: undefined,
      ci: false,
    });
    assert.deepStrictEqual(Object.keys(second.targets), ['chrome']);
    assert.strictEqual(second.targets.chrome?.viewport, '1024x768');
    assert.notStrictEqual(second.integration, first.integration);
  });

  it('does not clobber values with defaults', async () => {
    tmpfs.mock({
      'happo.config.ts': `
        export default {
          endpoint: 'https://test-endpoint.com',
          githubApiUrl: 'https://test-github-api-url.com',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',

          integration: {
            type: 'cypress',
          },

          targets: {
            chrome: {
              type: 'chrome',
              viewport: '800x600',
              freezeAnimations: 'first-frame',
              prefersReducedMotion: false,
            },
            safari: {
              type: 'safari',
            },
            firefox: {
              type: 'firefox',
              viewport: '800x600',
              freezeAnimations: 'first-frame',
              prefersReducedMotion: false,
            },
          },
        };
      `,
    });

    const config = await loadConfigFile(findConfigFile(), {
      link: 'https://github.com/happo/happo/pull/123',
      ci: false,
    });

    assert.ok(config);
    assert.strictEqual(config.endpoint, 'https://test-endpoint.com');
    assert.strictEqual(config.githubApiUrl, 'https://test-github-api-url.com');
    assert.strictEqual(config.integration?.type, 'cypress');

    assert.deepStrictEqual(config.targets, {
      chrome: {
        type: 'chrome',
        viewport: '800x600',
        freezeAnimations: 'first-frame',
        prefersReducedMotion: false,
        allowPointerEvents: true,
      },
      safari: {
        type: 'safari',
        viewport: '1024x768',
        freezeAnimations: 'last-frame',
        prefersReducedMotion: true,
        allowPointerEvents: true,
      },
      firefox: {
        type: 'firefox',
        viewport: '800x600',
        freezeAnimations: 'first-frame',
        prefersReducedMotion: false,
        allowPointerEvents: true,
      },
    });
  });

  it('does not clobber allowPointerEvents: false with the default', async () => {
    tmpfs.mock({
      'happo.config.ts': `
        export default {
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
          targets: {
            chrome: {
              type: 'chrome',
              allowPointerEvents: false,
            },
          },
        };
      `,
    });

    const config = await loadConfigFile(findConfigFile(), {
      link: undefined,
      ci: false,
    });

    assert.ok(config);
    assert.strictEqual(config.targets['chrome']?.allowPointerEvents, false);
  });

  describe('animate validation', () => {
    it('throws an error when animate: true is set on an ios-safari target', async () => {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            apiKey: 'test-api-key',
            apiSecret: 'test-api-secret',
            targets: {
              mobile: {
                type: 'ios-safari',
                animate: true,
              },
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `targets\.mobile\.animate` in config file \S+: animated snapshots are not supported on "ios-safari" targets/,
      );
    });

    it('throws an error when animate: "auto" is set on an ipad-safari target', async () => {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            apiKey: 'test-api-key',
            apiSecret: 'test-api-secret',
            targets: {
              tablet: {
                type: 'ipad-safari',
                animate: 'auto',
              },
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `targets\.tablet\.animate` in config file \S+: animated snapshots are not supported on "ipad-safari" targets/,
      );
    });

    it('throws an error when a trigger is set on an ios-safari target, even without an explicit mode', async () => {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            apiKey: 'test-api-key',
            apiSecret: 'test-api-secret',
            targets: {
              mobile: {
                type: 'ios-safari',
                animate: {
                  trigger: { selector: '.toast', action: 'addClass', value: 'is-open' },
                },
              },
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `targets\.mobile\.animate` in config file \S+: animated snapshots are not supported on "ios-safari" targets/,
      );
    });

    it('allows animate: false on an ios-safari target', async () => {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            apiKey: 'test-api-key',
            apiSecret: 'test-api-secret',
            targets: {
              mobile: {
                type: 'ios-safari',
                animate: false,
              },
            },
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });

      assert.strictEqual(config.targets['mobile']?.animate, false);
    });

    it('allows animate: { mode: "off" } on an ipad-safari target', async () => {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            apiKey: 'test-api-key',
            apiSecret: 'test-api-secret',
            targets: {
              tablet: {
                type: 'ipad-safari',
                animate: { mode: 'off' },
              },
            },
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });

      assert.deepStrictEqual(config.targets['tablet']?.animate, { mode: 'off' });
    });

    it('allows animate on a desktop target and passes it through unchanged', async () => {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            apiKey: 'test-api-key',
            apiSecret: 'test-api-secret',
            targets: {
              chrome: {
                type: 'chrome',
                viewport: '1024x768',
                animate: { mode: 'auto', fps: 15, maxFrames: 60 },
              },
            },
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });

      assert.deepStrictEqual(config.targets['chrome']?.animate, {
        mode: 'auto',
        fps: 15,
        maxFrames: 60,
      });
    });

    it('allows a nested prefersReducedMotion override and passes it through unchanged', async () => {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            apiKey: 'test-api-key',
            apiSecret: 'test-api-secret',
            targets: {
              chrome: {
                type: 'chrome',
                viewport: '1024x768',
                animate: { mode: 'auto', prefersReducedMotion: false },
              },
            },
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });

      assert.deepStrictEqual(config.targets['chrome']?.animate, {
        mode: 'auto',
        prefersReducedMotion: false,
      });
    });

    it('passes discovery, sampling, root and expectations through unchanged', async () => {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            apiKey: 'test-api-key',
            apiSecret: 'test-api-secret',
            targets: {
              chrome: {
                type: 'chrome',
                viewport: '1024x768',
                animate: {
                  mode: 'auto',
                  discovery: { settleMs: 400 },
                  sampling: [
                    { stop: 0.5, frames: 7 },
                    { stop: 1, frames: 3 },
                  ],
                  root: '#panel',
                  expect: { minAnimations: 1 },
                  onExpectationFailure: 'fail',
                },
              },
            },
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });

      assert.deepStrictEqual(config.targets['chrome']?.animate, {
        mode: 'auto',
        discovery: { settleMs: 400 },
        sampling: [
          { stop: 0.5, frames: 7 },
          { stop: 1, frames: 3 },
        ],
        root: '#panel',
        expect: { minAnimations: 1 },
        onExpectationFailure: 'fail',
      });
    });
  });

  describe('targets validation', () => {
    it('throws a helpful error when targets is an array of browser names', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: ['chrome', 'firefox'],
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        (error: Error) => {
          assert.ok(error instanceof TypeError);
          assert.match(
            error.message,
            /^Invalid `targets` in config file \S+: must be an object where each key is a name you choose for the target and each value is an object describing the browser, got an array\. For example:/,
          );
          assert.ok(
            error.message.includes(
              [
                '  targets: {',
                "    chrome: { type: 'chrome', viewport: '1024x768' },",
                "    firefox: { type: 'firefox', viewport: '1024x768' },",
                '  },',
              ].join('\n'),
            ),
            error.message,
          );
          assert.match(
            error.message,
            /See https:\/\/docs\.happo\.io\/docs\/configuration#targets$/,
          );
          return true;
        },
      );
    });

    it('throws a helpful error when targets is a string', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: 'safari',
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        (error: Error) => {
          assert.match(error.message, /got string 'safari'\. For example:/);
          assert.ok(
            error.message.includes(
              "    safari: { type: 'safari', viewport: '1024x768' },",
            ),
            error.message,
          );
          return true;
        },
      );
    });

    it('throws a helpful error when a target is a string instead of an object', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              desktop: 'firefox',
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        (error: Error) => {
          assert.ok(error instanceof TypeError);
          assert.match(
            error.message,
            /^Invalid target `desktop` in config file \S+: each target must be an object describing the browser, got string 'firefox'\. For example:/,
          );
          assert.ok(
            error.message.includes(
              "    desktop: { type: 'firefox', viewport: '1024x768' },",
            ),
            error.message,
          );
          return true;
        },
      );
    });

    it('suggests a chrome target when a target value is not a known browser', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              'my-target': true,
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        (error: Error) => {
          assert.match(error.message, /got boolean true\. For example:/);
          assert.ok(
            error.message.includes(
              "    'my-target': { type: 'chrome', viewport: '1024x768' },",
            ),
            error.message,
          );
          return true;
        },
      );
    });

    it('throws a helpful error when targets is not a plain object', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: new Map([['chrome', { type: 'chrome' }]]),
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /^TypeError: Invalid `targets` in config file \S+: must be an object .+, got object Map\(1\) \{ 'chrome' => \{ type: 'chrome' \} \}\. For example:/,
      );
    });

    it('accepts targets created with a null prototype', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: Object.assign(Object.create(null), {
              chrome: { type: 'chrome' },
            }),
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });
      assert.strictEqual(config.targets.chrome?.type, 'chrome');
    });

    it('escapes target names in the example snippet', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              "user's": 'firefox',
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        (error: Error) => {
          assert.ok(
            error.message.includes(
              `    "user's": { type: 'firefox', viewport: '1024x768' },`,
            ),
            error.message,
          );
          return true;
        },
      );
    });

    it('suggests a chrome type when a target with an unknown name is missing a type', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              desktop: { viewport: '1200x800' },
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        (error: Error) => {
          assert.ok(
            error.message.includes(
              "    desktop: { type: 'chrome', viewport: '1024x768' },",
            ),
            error.message,
          );
          return true;
        },
      );
    });

    it('throws a helpful error when a target is missing a type', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { viewport: '1024x768' },
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        (error: Error) => {
          assert.ok(error instanceof TypeError);
          assert.match(
            error.message,
            /^Invalid target `chrome` in config file \S+: `type` must be one of 'chrome', 'firefox', 'edge', 'safari', 'ios-safari', 'ipad-safari', 'accessibility', got nothing\. For example:/,
          );
          assert.ok(
            error.message.includes(
              "    chrome: { type: 'chrome', viewport: '1024x768' },",
            ),
            error.message,
          );
          return true;
        },
      );
    });

    it('throws a helpful error when a target type is not a string', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 42 },
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid target `chrome` in config file \S+: `type` must be one of .+, got 42\. For example:/,
      );
    });
  });

  describe('deepCompare validation', () => {
    it('accepts valid deepCompare settings', async () => {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              compareThreshold: 0.5,
              diffAlgorithm: 'color-delta',
              ignoreThreshold: 0.01,
              ignoreWhitespace: true,
              applyBlur: false,
            },
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });

      assert.ok(config.deepCompare);
      assert.strictEqual(config.deepCompare.compareThreshold, 0.5);
      assert.strictEqual(config.deepCompare.diffAlgorithm, 'color-delta');
      assert.strictEqual(config.deepCompare.ignoreThreshold, 0.01);
      assert.strictEqual(config.deepCompare.ignoreWhitespace, true);
      assert.strictEqual(config.deepCompare.applyBlur, false);
    });

    it('accepts deepCompare settings with only required fields', async () => {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              compareThreshold: 0.8,
            },
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });

      assert.ok(config.deepCompare);
      assert.strictEqual(config.deepCompare.compareThreshold, 0.8);
      assert.strictEqual(config.deepCompare.diffAlgorithm, 'color-delta');
    });

    it('defaults diffAlgorithm to color-delta when not provided', async () => {
      tmpfs.mock({
        'happo.config.ts': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              compareThreshold: 0.5,
            },
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });

      assert.ok(config.deepCompare);
      assert.strictEqual(config.deepCompare.diffAlgorithm, 'color-delta');
    });

    it('throws an error if compareThreshold is missing', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              diffAlgorithm: 'color-delta',
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Missing required option `deepCompare\.compareThreshold` in config file \S+\./,
      );
    });

    it('throws an error if deepCompare is not an object', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: 'invalid',
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `deepCompare` in config file \S+: must be an object, got: 'invalid'/,
      );
    });

    it('throws an error if deepCompare is an array', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: [],
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `deepCompare` in config file \S+: must be an object, got: \[\]/,
      );
    });

    it('throws an error if diffAlgorithm is invalid', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              diffAlgorithm: 'invalid-algorithm',
              compareThreshold: 0.5,
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `deepCompare.diffAlgorithm` in config file \S+: must be one of 'color-delta', 'ssim', got: 'invalid-algorithm'/,
      );
    });

    it('throws an error if diffAlgorithm is not a string', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              diffAlgorithm: 123,
              compareThreshold: 0.5,
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `deepCompare.diffAlgorithm` in config file \S+: must be one of 'color-delta', 'ssim', got: 123/,
      );
    });

    it('throws an error if compareThreshold is not a number', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              compareThreshold: 'invalid',
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `deepCompare.compareThreshold` in config file \S+: must be a number between 0 and 1, got: 'invalid'/,
      );
    });

    it('throws an error if compareThreshold is less than 0', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              compareThreshold: -0.1,
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `deepCompare.compareThreshold` in config file \S+: must be a number between 0 and 1, got: -0.1/,
      );
    });

    it('throws an error if compareThreshold is greater than 1', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              compareThreshold: 1.1,
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `deepCompare.compareThreshold` in config file \S+: must be a number between 0 and 1, got: 1.1/,
      );
    });

    it('throws an error if ignoreThreshold is not a number', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              compareThreshold: 0.5,
              ignoreThreshold: 'invalid',
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `deepCompare.ignoreThreshold` in config file \S+: must be a number between 0 and 1, got: 'invalid'/,
      );
    });

    it('throws an error if ignoreThreshold is less than 0', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              compareThreshold: 0.5,
              ignoreThreshold: -0.1,
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `deepCompare.ignoreThreshold` in config file \S+: must be a number between 0 and 1, got: -0.1/,
      );
    });

    it('throws an error if ignoreThreshold is greater than 1', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              compareThreshold: 0.5,
              ignoreThreshold: 1.1,
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `deepCompare.ignoreThreshold` in config file \S+: must be a number between 0 and 1, got: 1.1/,
      );
    });

    it('throws an error if ignoreWhitespace is not a boolean', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              compareThreshold: 0.5,
              ignoreWhitespace: 'invalid',
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `deepCompare.ignoreWhitespace` in config file \S+: must be a boolean, got: 'invalid'/,
      );
    });

    it('throws an error if applyBlur is not a boolean', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            deepCompare: {
              compareThreshold: 0.5,
              applyBlur: 'invalid',
            },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `deepCompare.applyBlur` in config file \S+: must be a boolean, got: 'invalid'/,
      );
    });
  });

  describe('unknown options', () => {
    it('warns about unknown options, suggesting close matches, and keeps them', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            stylesheets: ['main.css'],
            targets: {
              chrome: { type: 'chrome', viewPort: '800x600' },
            },
            integration: { type: 'storybook', confgDir: '.storybook' },
          };
        `,
      });

      const logger = { log: mock.fn(), error: mock.fn() };
      const config = await loadConfigFile(
        findConfigFile(),
        { link: undefined, ci: false },
        logger,
      );

      const warnings = logger.error.mock.calls.map((call) => call.arguments[0]);
      assert.strictEqual(warnings.length, 3);
      assert.match(
        warnings[0],
        /^\[HAPPO\] Unknown option `stylesheets` in config file \S+\. This will be an error in the next major version of Happo\.$/,
      );
      assert.match(
        warnings[1],
        /^\[HAPPO\] Unknown option `targets\.chrome\.viewPort` in config file \S+\. Did you mean `viewport`\?/,
      );
      assert.match(
        warnings[2],
        /^\[HAPPO\] Unknown option `integration\.confgDir` in config file \S+\. Did you mean `configDir`\?/,
      );

      // Unknown options are still passed along, as they were before.
      assert.strictEqual(config.targets.chrome?.viewport, '1024x768');
      assert.ok(Object.keys(config.targets.chrome ?? {}).includes('viewPort'));
    });

    it('does not warn for a config that only uses known options', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            project: 'my-project',
            targets: {
              chrome: {
                type: 'chrome',
                viewport: '1024x768',
                animate: { mode: 'auto', trigger: { selector: '.a', action: 'click' } },
                outgoingRequestHeaders: [{ name: 'x-happo', value: '1' }],
              },
              ios: { type: 'ios-safari' },
            },
            integration: {
              type: 'pages',
              pages: [{ url: 'https://example.com', title: 'Home', animate: 'auto' }],
            },
            deepCompare: { compareThreshold: 0.1, ignoreWhitespace: true },
          };
        `,
      });

      const logger = { log: mock.fn(), error: mock.fn() };
      await loadConfigFile(findConfigFile(), { link: undefined, ci: false }, logger);

      assert.strictEqual(logger.error.mock.callCount(), 0);
    });
  });

  describe('schema validation', () => {
    it('treats options set to undefined as if they were left out', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            project: undefined,
            endpoint: undefined,
            targets: {
              chrome: { type: 'chrome', maxHeight: undefined },
            },
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });

      assert.strictEqual(config.endpoint, 'https://happo.io');
      assert.strictEqual('project' in config, false);
      assert.strictEqual('maxHeight' in (config.targets.chrome ?? {}), false);
    });

    it('treats deepCompare: null as if it were left out', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            deepCompare: null,
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });

      assert.strictEqual('deepCompare' in config, false);
    });

    it('applies target defaults when they are set to null', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: null, prefersReducedMotion: null },
            },
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });

      assert.strictEqual(config.targets.chrome?.viewport, '1024x768');
      assert.strictEqual(config.targets.chrome?.prefersReducedMotion, true);
    });

    it('defaults the integration to storybook', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default { apiKey: 'test-key', apiSecret: 'test-secret' };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });

      assert.deepStrictEqual(config.integration, { type: 'storybook' });
    });

    it('throws a helpful error for an invalid viewport', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: { chrome: { type: 'chrome', viewport: '1024 x 768' } },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /^TypeError: Invalid `targets\.chrome\.viewport` in config file \S+: must be a string like '1024x768', got: '1024 x 768'\.$/,
      );
    });

    it('reports errors nested inside animate options', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: { chrome: { type: 'chrome', animate: { mode: 'sometimes' } } },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /^TypeError: Invalid `targets\.chrome\.animate\.mode` in config file \S+: must be one of 'off', 'auto', 'always', got: 'sometimes'\.$/,
      );
    });

    it('throws a helpful error for an unknown integration type', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            integration: { type: 'storybok' },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /^TypeError: Invalid `integration\.type` in config file \S+: must be one of 'storybook', 'cypress', 'playwright', 'custom', 'pages', got: 'storybok'\.$/,
      );
    });

    it('throws a helpful error when a custom integration is missing build', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            integration: { type: 'custom' },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /^TypeError: Missing required option `integration\.build` in config file \S+\.$/,
      );
    });

    it('includes the index when an item in an array is invalid', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            integration: { type: 'pages', pages: [{ url: 'https://example.com' }] },
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /^TypeError: Missing required option `integration\.pages\[0\]\.title` in config file \S+\.$/,
      );
    });

    it('reports every problem at once', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            endpoint: 5,
            targets: { chrome: { type: 'chrome', maxHeight: '100' } },
            failOnWaitForTimeout: 'yes',
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        (error: Error) => {
          assert.ok(error instanceof TypeError);
          const lines = error.message.split('\n\n');
          assert.match(lines[0] ?? '', /^Found 3 problems in config file \S+:$/);
          assert.match(
            lines[1] ?? '',
            /^- Invalid `endpoint` .+: must be a string, got: 5\.$/,
          );
          assert.match(
            lines[2] ?? '',
            /^- Invalid `targets\.chrome\.maxHeight` .+: must be a number, got: '100'\.$/,
          );
          assert.match(
            lines[3] ?? '',
            /^- Invalid `failOnWaitForTimeout` .+: must be a boolean, got: 'yes'\.$/,
          );
          return true;
        },
      );
    });

    it('validates the config before attempting alternative authentication', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default { failOnWaitForTimeout: 'yes' };
        `,
      });

      const logger = { log: mock.fn(), error: mock.fn() };
      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: true }, logger),
        /Invalid `failOnWaitForTimeout`/,
      );
      assert.strictEqual(logger.log.mock.callCount(), 0);
    });
  });

  describe('failOnWaitForTimeout validation', () => {
    it('throws an error if failOnWaitForTimeout is not a boolean', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            failOnWaitForTimeout: 'yes',
          };
        `,
      });

      await assert.rejects(
        loadConfigFile(findConfigFile(), { link: undefined, ci: false }),
        /Invalid `failOnWaitForTimeout` in config file \S+: must be a boolean, got: 'yes'/,
      );
    });

    it('accepts failOnWaitForTimeout: false', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
            failOnWaitForTimeout: false,
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });
      assert.strictEqual(config.failOnWaitForTimeout, false);
    });

    it('defaults failOnWaitForTimeout to true when not provided', async () => {
      tmpfs.mock({
        'happo.config.js': `
          export default {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            targets: {
              chrome: { type: 'chrome', viewport: '1024x768' },
            },
          };
        `,
      });

      const config = await loadConfigFile(findConfigFile(), {
        link: undefined,
        ci: false,
      });
      assert.strictEqual(config.failOnWaitForTimeout, true);
    });
  });
});
