import assert from 'node:assert';

import type { Mock } from 'vitest';
import { beforeEach, describe, it, vi } from 'vitest';

import type { ConfigWithDefaults } from '../../config/index.ts';
import type { EnvironmentResult } from '../../environment/index.ts';
import { ErrorWithStatusCode } from '../fetchWithRetry.ts';

interface Logger {
  log: Mock<Console['log']>;
  error: Mock<Console['error']>;
}

type MakeHappoAPIRequestImpl = (...args: Array<unknown>) => Promise<unknown>;

let makeHappoAPIRequestImpl: MakeHappoAPIRequestImpl;
const makeHappoAPIRequestMock = vi.hoisted(() =>
  vi.fn(async (...args: Array<unknown>) => {
    return await makeHappoAPIRequestImpl(...args);
  }),
);

vi.mock('../makeHappoAPIRequest.ts', () => ({
  default: makeHappoAPIRequestMock,
}));

let cancelJob: typeof import('../cancelJob.ts').default;
let logger: Logger;
let config: ConfigWithDefaults;
let environment: EnvironmentResult;

beforeEach(async () => {
  logger = {
    log: vi.fn(),
    error: vi.fn(),
  };

  config = {
    endpoint: 'https://happo.io',
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    project: 'test-project',
    githubApiUrl: 'https://api.github.com',
    targets: {},
    integration: {
      type: 'custom',
      build: async () => ({
        rootDir: './custom',
        entryPoint: 'index.js',
      }),
    },
    failOnWaitForTimeout: true,
  };

  environment = {
    beforeSha: 'before-sha',
    afterSha: 'after-sha',
    link: 'https://example.com',
    message: 'test-message',
    authorEmail: 'test@example.com',
    nonce: 'test-nonce',
    debugMode: false,
    notify: 'test@example.com',
    fallbackShas: ['test-sha'],
    githubToken: 'test-token',
    ci: false,
    ciJobUrl: undefined,
    skip: undefined,
    only: undefined,
  };

  makeHappoAPIRequestImpl = async () => {
    throw new Error('makeHappoAPIRequest not configured');
  };

  ({ default: cancelJob } = await import('../cancelJob.ts'));
});

describe('cancelJob', () => {
  it('logs and ignores when job is already completed', async () => {
    makeHappoAPIRequestImpl = async () => {
      throw new ErrorWithStatusCode('Conflict', 409);
    };

    await assert.doesNotReject(cancelJob('failure', 'test-message', config, environment, logger));

    assert.strictEqual(logger.error.mock.calls.length, 1);
    assert.strictEqual(
      logger.error.mock.calls[0]?.[0],
      'Skipping cancellation of Happo job because it has already been completed',
    );
  });

  it('logs and ignores when job does not exist', async () => {
    makeHappoAPIRequestImpl = async () => {
      throw new ErrorWithStatusCode('No job found', 404);
    };

    await assert.doesNotReject(cancelJob('failure', 'test-message', config, environment, logger));

    assert.strictEqual(logger.error.mock.calls.length, 1);
    assert.strictEqual(
      logger.error.mock.calls[0]?.[0],
      'Skipping cancellation of Happo job because it does not exist',
    );
  });

  it('throws when job does not exist but message is different', async () => {
    makeHappoAPIRequestImpl = async () => {
      throw new ErrorWithStatusCode('Other message', 404);
    };

    await assert.rejects(cancelJob('failure', 'test-message', config, environment, logger));
  });

  it('throws for unexpected errors', async () => {
    makeHappoAPIRequestImpl = async () => {
      throw new Error('boom');
    };

    await assert.rejects(cancelJob('failure', 'test-message', config, environment, logger));
  });
});
