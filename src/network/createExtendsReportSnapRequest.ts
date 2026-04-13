import type { ConfigWithDefaults } from '../config/index.ts';
import type { SkipItem } from '../isomorphic/types.ts';
import makeHappoAPIRequest from './makeHappoAPIRequest.ts';

export default async function createExtendsReportSnapRequest(
  extendsSha: string,
  skip: Array<SkipItem>,
  config: ConfigWithDefaults,
): Promise<number> {
  const result = await makeHappoAPIRequest(
    {
      path: '/api/snap-requests/extends-report',
      method: 'POST',
      body: {
        extendedSnaps: skip,
        extendsSha,
        project: config.project,
      },
    },
    config,
    { retryCount: 3 },
  );

  if (!result || !('requestId' in result) || typeof result.requestId !== 'number') {
    throw new Error(`Invalid response from extends-report snap request API: ${JSON.stringify(result)}`);
  }

  return result.requestId;
}
