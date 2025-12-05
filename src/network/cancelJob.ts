import type { ConfigWithDefaults } from '../config/index.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import type { Logger } from '../isomorphic/types.ts';
import { ErrorWithStatusCode } from './fetchWithRetry.ts';
import makeHappoAPIRequest from './makeHappoAPIRequest.ts';

type Status = 'failure' | 'success';

/**
 * Tell Happo that a job comparing two SHAs had to be cancelled for some reason.
 *
 * @see https://happo.io/docs/api#cancelJob
 */
export default async function cancelJob(
  status: Status,
  config: ConfigWithDefaults,
  { beforeSha, afterSha, link, message }: EnvironmentResult,
  logger: Logger,
): Promise<void> {
  try {
    await makeHappoAPIRequest(
      {
        path: `/api/jobs/${beforeSha}/${afterSha}/cancel`,
        method: 'POST',
        body: {
          link,
          message,
          project: config.project,
          status,
        },
      },
      config,
      { retryCount: 5 },
      logger,
    );
  } catch (error) {
    if (error instanceof ErrorWithStatusCode && error.statusCode === 409) {
      // This API endpoint responds with a 409 when the job has already been
      // completed. This is expected behavior and we can just log the error and
      // continue.
      logger.error(
        'Skipping cancellation of Happo job because it has already been completed',
        error,
      );
    } else {
      throw error;
    }
  }
}
