import assert from 'node:assert';
import type { Mock } from 'node:test';
import { beforeEach, describe, it, mock } from 'node:test';

import type { ConfigWithDefaults } from '../../config/index.ts';
import type { EnvironmentResult } from '../../environment/index.ts';
import type makeHappoAPIRequest from '../makeHappoAPIRequest.ts';

interface TestLogger {
  log: Mock<Console['log']>;
  error: Mock<Console['error']>;
}

type MakeHappoAPIRequestImpl = (...args: Array<unknown>) => Promise<object | null>;

let makeHappoAPIRequestImpl: MakeHappoAPIRequestImpl;
const makeHappoAPIRequestMock: Mock<typeof makeHappoAPIRequest> = mock.fn(
  async (...args: Array<unknown>) => {
    return await makeHappoAPIRequestImpl(...args);
  },
);

mock.module('../makeHappoAPIRequest.ts', {
  defaultExport: makeHappoAPIRequestMock,
});

let logger: TestLogger;
let config: ConfigWithDefaults;
let environment: EnvironmentResult;
let findBaselineReport: typeof import('../findBaselineReport.ts').default;

beforeEach(async () => {
  logger = {
    log: mock.fn(),
    error: mock.fn(),
  };

  config = {
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    endpoint: 'https://happo.io',
    githubApiUrl: 'https://api.github.com',
    project: 'test-project',
    targets: {},
    integration: { type: 'storybook' },
  };

  environment = {
    beforeSha: 'before-sha',
    afterSha: 'after-sha',
    link: undefined,
    message: undefined,
    authorEmail: undefined,
    nonce: undefined,
    debugMode: false,
    notify: undefined,
    fallbackShas: ['fallback-sha-1', 'fallback-sha-2'],
    githubToken: undefined,
    ci: false,
    skippedExamples: undefined,
  };

  makeHappoAPIRequestImpl = async () => ({ sha: 'baseline-sha-123' });

  ({ default: findBaselineReport } = await import('../findBaselineReport.ts'));
  makeHappoAPIRequestMock.mock.resetCalls();
});

describe('findBaselineReport', () => {
  it('posts to the correct endpoint using afterSha', async () => {
    await findBaselineReport(environment, config, logger);

    assert.strictEqual(makeHappoAPIRequestMock.mock.callCount(), 1);
    const call = makeHappoAPIRequestMock.mock.calls[0];
    assert.ok(call);
    assert.strictEqual(
      call.arguments[0]?.path,
      '/api/reports/after-sha/find-baseline',
    );
    assert.strictEqual(call.arguments[0]?.method, 'POST');
  });

  it('includes project and shas (beforeSha + fallbackShas) in the request body', async () => {
    await findBaselineReport(environment, config, logger);

    const call = makeHappoAPIRequestMock.mock.calls[0];
    assert.ok(call);
    const body = call.arguments[0]?.body as {
      project?: string;
      shas?: Array<string>;
    };
    assert.ok(body);
    assert.strictEqual(body.project, 'test-project');
    assert.deepStrictEqual(body.shas, [
      'before-sha',
      'fallback-sha-1',
      'fallback-sha-2',
    ]);
  });

  it('uses only beforeSha in shas when there are no fallbackShas', async () => {
    environment.fallbackShas = undefined;

    await findBaselineReport(environment, config, logger);

    const call = makeHappoAPIRequestMock.mock.calls[0];
    assert.ok(call);
    const body = call.arguments[0]?.body as { shas?: Array<string> };
    assert.ok(body);
    assert.deepStrictEqual(body.shas, ['before-sha']);
  });

  it('returns the sha from the API response', async () => {
    const result = await findBaselineReport(environment, config, logger);

    assert.strictEqual(result, 'baseline-sha-123');
  });

  it('returns undefined when the response has no sha property', async () => {
    makeHappoAPIRequestImpl = async () => ({ status: 'not-found' });

    const result = await findBaselineReport(environment, config, logger);

    assert.strictEqual(result, undefined);
  });

  it('returns undefined and logs an error when the request throws', async () => {
    makeHappoAPIRequestImpl = async () => {
      throw new Error('network failure');
    };

    const result = await findBaselineReport(environment, config, logger);

    assert.strictEqual(result, undefined);
    assert.strictEqual(logger.error.mock.callCount(), 1);
  });
});
