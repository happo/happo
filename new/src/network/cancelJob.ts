import type { ConfigWithDefaults } from '../config/index.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import type { Logger } from '../isomorphic/types.ts';
import makeHappoAPIRequest from './makeHappoAPIRequest.ts';

type Status = 'failure' | 'success';

/**
 * Tell Happo that a job comparing two SHAs had to be cancelled for some reason.
 *
 * @see https://happo.io/docs/api#cancelJob
 */
export default async function cancelJob(
  status: Status,
  { apiKey, apiSecret, endpoint, project }: ConfigWithDefaults,
  { beforeSha, afterSha, link, message }: EnvironmentResult,
  logger: Logger,
): Promise<void> {
  await makeHappoAPIRequest(
    {
      url: `${endpoint}/api/jobs/${beforeSha}/${afterSha}/cancel`,
      method: 'POST',
      body: {
        link,
        message,
        project,
        status,
      },
    },
    {
      apiKey,
      apiSecret,
      retryCount: 5,
    },
    logger,
  );
}
