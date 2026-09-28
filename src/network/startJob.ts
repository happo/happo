import type { ConfigWithDefaults } from '../config/index.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import type { Logger } from '../isomorphic/types.ts';
import makeHappoAPIRequest from './makeHappoAPIRequest.ts';

export interface StartJobResult {
  id: number;
  url: string;
}

function assertResultIsStartJobResult(
  result: unknown,
): asserts result is StartJobResult {
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

/**
 * Tell Happo that we are about to run a job
 *
 * @see https://happo.io/docs/api#createJob
 */
export default async function startJob(
  config: ConfigWithDefaults,
  { beforeSha, afterSha, link, message }: EnvironmentResult,
  logger: Logger,
): Promise<StartJobResult> {
  const result = await makeHappoAPIRequest(
    {
      path: `/api/jobs/${beforeSha}/${afterSha}`,
      method: 'POST',
      body: {
        link,
        message,
        project: config.project,
      },
    },
    config,
    { retryCount: 5 },
    logger,
  );

  assertResultIsStartJobResult(result);

  return result;
}
