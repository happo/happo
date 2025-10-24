import type { ConfigWithDefaults } from '../config/index.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import type { Logger } from '../isomorphic/types.ts';
import makeHappoAPIRequest from './makeHappoAPIRequest.ts';

interface CreateAsyncComparisonResult {
  id: number;
  statusImageUrl: string;
  compareUrl: string;
}

function assertResultIsCreateAsyncComparisonResult(
  result: unknown,
): asserts result is CreateAsyncComparisonResult {
  if (typeof result !== 'object' || result === null) {
    throw new TypeError('Result is not an object');
  }

  if (!('id' in result) || typeof result.id !== 'number') {
    throw new TypeError('Result is missing id');
  }

  if (!('statusImageUrl' in result) || typeof result.statusImageUrl !== 'string') {
    throw new TypeError('Result is missing statusImageUrl');
  }

  if (!('compareUrl' in result) || typeof result.compareUrl !== 'string') {
    throw new TypeError('Result is missing compareUrl');
  }
}

/**
 * Create an async comparison between two SHAs
 *
 * @see https://happo.io/docs/api#compareReports
 */
export default async function createAsyncComparison(
  { apiKey, apiSecret, endpoint, project }: ConfigWithDefaults,
  {
    beforeSha,
    afterSha,
    link,
    message,
    author,
    notify,
    fallbackShas,
  }: EnvironmentResult,
  logger: Logger,
): Promise<CreateAsyncComparisonResult> {
  const result = await makeHappoAPIRequest(
    {
      url: `${endpoint}/api/reports/${beforeSha}/compare/${afterSha}`,
      method: 'POST',
      body: {
        link,
        message,
        author,
        project,
        isAsync: true,
        notify,
        fallbackShas,
      },
    },
    {
      apiKey,
      apiSecret,
      retryCount: 3,
    },
    logger,
  );

  assertResultIsCreateAsyncComparisonResult(result);

  return result;
}
