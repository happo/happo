import assert from 'node:assert';
import type { Mock } from 'node:test';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import type { ConfigWithDefaults, DeepCompareSettings } from '../../config/index.ts';
import type { EnvironmentResult } from '../../environment/index.ts';
import type makeHappoAPIRequest from '../makeHappoAPIRequest.ts';

interface TestLogger {
  log: Mock<Console['log']>;
  error: Mock<Console['error']>;
}

let logger: TestLogger;
let config: ConfigWithDefaults;
let environment: EnvironmentResult;
let createAsyncComparison: typeof import('../createAsyncComparison.ts').default;

const makeHappoAPIRequestMock: Mock<typeof makeHappoAPIRequest> = mock.fn(
  async () => {
    return {
      id: 123,
      statusImageUrl: 'https://happo.io/api/reports/123/status-image',
      compareUrl: 'https://happo.io/api/reports/123/compare',
    };
  },
);

// mock makeHappoAPIRequest.ts *before* importing createAsyncComparison
mock.module('../makeHappoAPIRequest.ts', {
  defaultExport: makeHappoAPIRequestMock,
});

beforeEach(async () => {
  logger = {
    log: mock.fn(),
    error: mock.fn(),
  };

  // Now import the SUT; it will see the mocked module
  ({ default: createAsyncComparison } = await import('../createAsyncComparison.ts'));

  config = {
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    endpoint: 'https://happo.io',
    githubApiUrl: 'https://api.github.com',
    targets: {
      chrome: {
        type: 'chrome',
        viewport: '1024x768',
        __dynamic: false,
      },
    },
    integration: {
      type: 'storybook',
    },
  };

  environment = {
    beforeSha: 'before-sha',
    afterSha: 'after-sha',
    link: 'https://github.com/owner/repo/pull/123',
    message: 'Test message',
    authorEmail: 'test@example.com',
    notify: undefined,
    fallbackShas: undefined,
    ci: false,
    nonce: undefined,
    githubToken: undefined,
    debugMode: false,
  };

  makeHappoAPIRequestMock.mock.resetCalls();
});

afterEach(() => {
  makeHappoAPIRequestMock.mock.resetCalls();
});

describe('createAsyncComparison', () => {
  it('passes deepCompare settings when configured', async () => {
    const deepCompare: DeepCompareSettings = {
      compareThreshold: 0.5,
      diffAlgorithm: 'color-delta',
      ignoreThreshold: 0.01,
      ignoreWhitespace: true,
      applyBlur: false,
    };

    config.deepCompare = deepCompare;

    await createAsyncComparison(config, environment, logger);

    assert.strictEqual(makeHappoAPIRequestMock.mock.callCount(), 1);
    const call = makeHappoAPIRequestMock.mock.calls[0];
    assert.ok(call);
    assert.strictEqual(
      call.arguments[0]?.path,
      '/api/reports/before-sha/compare/after-sha',
    );
    assert.strictEqual(call.arguments[0]?.method, 'POST');

    const body = call.arguments[0]?.body as {
      deepCompare?: DeepCompareSettings;
      link?: string;
      message?: string;
      author?: string;
      project?: string;
      isAsync?: boolean;
    };

    assert.ok(body);
    assert.deepStrictEqual(body.deepCompare, deepCompare);
    assert.strictEqual(body.link, environment.link);
    assert.strictEqual(body.message, environment.message);
    assert.strictEqual(body.author, environment.authorEmail);
    assert.strictEqual(body.isAsync, true);
  });

  it('does not pass deepCompare when not configured', async () => {
    // Ensure deepCompare is undefined
    delete config.deepCompare;

    await createAsyncComparison(config, environment, logger);

    assert.strictEqual(makeHappoAPIRequestMock.mock.callCount(), 1);
    const call = makeHappoAPIRequestMock.mock.calls[0];
    assert.ok(call);

    const body = call.arguments[0]?.body as {
      deepCompare?: DeepCompareSettings;
      [key: string]: unknown;
    };

    assert.ok(body);
    assert.strictEqual('deepCompare' in body, false);
  });

  it('passes deepCompare settings', async () => {
    const deepCompare: DeepCompareSettings = {
      compareThreshold: 0.8,
      diffAlgorithm: 'ssim',
    };

    config.deepCompare = deepCompare;

    await createAsyncComparison(config, environment, logger);

    assert.strictEqual(makeHappoAPIRequestMock.mock.callCount(), 1);
    const call = makeHappoAPIRequestMock.mock.calls[0];
    assert.ok(call);

    const body = call.arguments[0]?.body as {
      deepCompare?: DeepCompareSettings;
    };

    assert.ok(body);
    assert.ok(body.deepCompare);
    assert.strictEqual(body.deepCompare.compareThreshold, 0.8);
    assert.strictEqual(body.deepCompare.diffAlgorithm, 'ssim');
  });

  it('throws error when beforeSha equals afterSha', async () => {
    environment.beforeSha = 'same-sha';
    environment.afterSha = 'same-sha';

    await assert.rejects(
      () => createAsyncComparison(config, environment, logger),
      /Cannot create an async comparison between the same SHA/,
    );
  });
});
