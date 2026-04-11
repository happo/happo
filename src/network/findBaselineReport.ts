import type { ConfigWithDefaults } from '../config/index.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import type { Logger } from '../isomorphic/types.ts';
import makeHappoAPIRequest from './makeHappoAPIRequest.ts';

export default async function findBaselineReport(
  environment: EnvironmentResult,
  config: ConfigWithDefaults,
  logger: Logger,
): Promise<string | undefined> {
  const shas = [environment.beforeSha, ...(environment.fallbackShas ?? [])].filter(Boolean);

  try {
    const result = await makeHappoAPIRequest(
      {
        path: `/api/reports/${environment.afterSha}/find-baseline`,
        method: 'POST',
        body: {
          project: config.project,
          shas,
        },
      },
      config,
      { retryCount: 2 },
      logger,
    );

    if (result && 'sha' in result && typeof result.sha === 'string') {
      return result.sha;
    }
  } catch (e) {
    logger.error('[HAPPO] Failed to find baseline report:', e);
  }

  return undefined;
}
