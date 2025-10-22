import type { ConfigWithDefaults } from '../config/index.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import type { Logger } from '../isomorphic/types.ts';
import makeHappoAPIRequest from './makeHappoAPIRequest.ts';

interface CreateAsyncReportResult {
  id: number;
  url: string;
}

function assertResultIsCreateAsyncReportResult(
  result: unknown,
): asserts result is CreateAsyncReportResult {
  if (typeof result !== 'object' || result === null) {
    throw new TypeError('Result is not an object');
  }

  if (!('id' in result) || typeof result.id !== 'number') {
    throw new TypeError('Result is missing id');
  }

  if (!('url' in result) || typeof result.url !== 'string') {
    throw new TypeError('Result is missing url');
  }
}

export default async function createAsyncReport(
  snapRequestIds: Array<number>,
  { apiKey, apiSecret, endpoint, project }: ConfigWithDefaults,
  { afterSha, link, message }: EnvironmentResult,
  logger: Logger,
): Promise<CreateAsyncReportResult> {
  const result = await makeHappoAPIRequest(
    {
      url: `${endpoint}/api/async-reports/${afterSha}`,
      method: 'POST',
      body: {
        requestIds: snapRequestIds,
        link,
        message,
        project,
      },
    },
    {
      apiKey,
      apiSecret,
      retryCount: 3,
    },
    logger,
  );

  assertResultIsCreateAsyncReportResult(result);

  return result;
}
