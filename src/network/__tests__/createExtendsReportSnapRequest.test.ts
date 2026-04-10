import assert from 'node:assert';
import type { Mock } from 'node:test';
import { beforeEach, describe, it, mock } from 'node:test';

import type { ConfigWithDefaults } from '../../config/index.ts';
import type { SkipItem } from '../../isomorphic/types.ts';
import type makeHappoAPIRequest from '../makeHappoAPIRequest.ts';

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

let config: ConfigWithDefaults;
let createExtendsReportSnapRequest: typeof import('../createExtendsReportSnapRequest.ts').default;

const skippedExamples: Array<SkipItem> = [
  { component: 'Button', variant: 'Primary' },
  { component: 'Button', variant: 'Secondary' },
];

beforeEach(async () => {
  config = {
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    endpoint: 'https://happo.io',
    githubApiUrl: 'https://api.github.com',
    project: 'test-project',
    targets: {},
    integration: { type: 'storybook' },
  };

  makeHappoAPIRequestImpl = async () => ({ requestId: 42 });

  ({ default: createExtendsReportSnapRequest } = await import(
    '../createExtendsReportSnapRequest.ts'
  ));
  makeHappoAPIRequestMock.mock.resetCalls();
});

describe('createExtendsReportSnapRequest', () => {
  it('posts to the extends-report endpoint', async () => {
    await createExtendsReportSnapRequest('baseline-sha', skippedExamples, config);

    assert.strictEqual(makeHappoAPIRequestMock.mock.callCount(), 1);
    const call = makeHappoAPIRequestMock.mock.calls[0];
    assert.ok(call);
    assert.strictEqual(call.arguments[0]?.path, '/api/snap-requests/extends-report');
    assert.strictEqual(call.arguments[0]?.method, 'POST');
  });

  it('sends extendedSnaps, extendsSha, and project in the request body', async () => {
    await createExtendsReportSnapRequest('baseline-sha', skippedExamples, config);

    const call = makeHappoAPIRequestMock.mock.calls[0];
    assert.ok(call);
    const body = call.arguments[0]?.body as {
      extendedSnaps?: Array<SkipItem>;
      extendsSha?: string;
      project?: string;
    };
    assert.ok(body);
    assert.deepStrictEqual(body.extendedSnaps, skippedExamples);
    assert.strictEqual(body.extendsSha, 'baseline-sha');
    assert.strictEqual(body.project, 'test-project');
  });

  it('returns the requestId from the response', async () => {
    const result = await createExtendsReportSnapRequest(
      'baseline-sha',
      skippedExamples,
      config,
    );

    assert.strictEqual(result, 42);
  });

  it('works with an empty skipped examples array', async () => {
    await createExtendsReportSnapRequest('baseline-sha', [], config);

    const call = makeHappoAPIRequestMock.mock.calls[0];
    assert.ok(call);
    const body = call.arguments[0]?.body as { extendedSnaps?: Array<SkipItem> };
    assert.ok(body);
    assert.deepStrictEqual(body.extendedSnaps, []);
  });

  it('throws when the response has no requestId', async () => {
    makeHappoAPIRequestImpl = async () => ({ status: 'ok' });

    await assert.rejects(
      () => createExtendsReportSnapRequest('baseline-sha', skippedExamples, config),
      /Invalid response from extends-report snap request API/,
    );
  });

  it('throws when requestId is not a number', async () => {
    makeHappoAPIRequestImpl = async () => ({ requestId: 'not-a-number' });

    await assert.rejects(
      () => createExtendsReportSnapRequest('baseline-sha', skippedExamples, config),
      /Invalid response from extends-report snap request API/,
    );
  });

  it('throws when the API request itself throws', async () => {
    makeHappoAPIRequestImpl = async () => {
      throw new Error('network failure');
    };

    await assert.rejects(
      () => createExtendsReportSnapRequest('baseline-sha', skippedExamples, config),
      /network failure/,
    );
  });
});
