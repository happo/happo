import assert from 'node:assert';
import http from 'node:http';
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
    assert.ok(foundConfigFile.endsWith('/happo.config.js'));
  });

  it('finds happo.config.mjs', () => {
    tmpfs.mock({
      'happo.config.mjs': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.mjs'));
  });

  it('finds happo.config.cjs', () => {
    tmpfs.mock({
      'happo.config.cjs': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.cjs'));
  });

  it('finds happo.config.ts', () => {
    tmpfs.mock({
      'happo.config.ts': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.ts'));
  });

  it('finds happo.config.mts', () => {
    tmpfs.mock({
      'happo.config.mts': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.mts'));
  });

  it('finds happo.config.cts', () => {
    tmpfs.mock({
      'happo.config.cts': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.cts'));
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
    assert.ok(foundConfigFile.endsWith(`${tmpDir}/happo.config.ts`));
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
    assert.ok(foundConfigFile.endsWith(`${tmpDir}/projects/pizza/happo.config.ts`));
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
    assert.ok(foundConfigFile.endsWith(`${tmpDir}/projects/pizza/happo.config.ts`));
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
      },
    });
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
      },
      safari: {
        type: 'safari',
        viewport: '1024x768',
        freezeAnimations: 'last-frame',
        prefersReducedMotion: true,
      },
      firefox: {
        type: 'firefox',
        viewport: '800x600',
        freezeAnimations: 'first-frame',
        prefersReducedMotion: false,
      },
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
        /Invalid `deepCompare` in config file \S+: `compareThreshold` is required/,
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
        /Invalid `deepCompare` in config file \S+: must be an object, got: string/,
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
        /Invalid `deepCompare` in config file \S+: must be an object, got: array/,
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
        /Invalid `deepCompare.diffAlgorithm` in config file \S+: must be "color-delta" or "ssim", got: "invalid-algorithm"/,
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
        /Invalid `deepCompare.diffAlgorithm` in config file \S+: must be "color-delta" or "ssim", got: 123/,
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
        /Invalid `deepCompare.compareThreshold` in config file \S+: must be a number between 0 and 1, got: "invalid"/,
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
        /Invalid `deepCompare.ignoreThreshold` in config file \S+: must be a number between 0 and 1, got: "invalid"/,
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
        /Invalid `deepCompare.ignoreWhitespace` in config file \S+: must be a boolean, got: "invalid"/,
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
        /Invalid `deepCompare.applyBlur` in config file \S+: must be a boolean, got: "invalid"/,
      );
    });
  });
});
