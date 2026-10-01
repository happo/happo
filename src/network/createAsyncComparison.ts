import type {
  BlockApprovalSettings,
  ConfigWithDefaults,
  DeepCompareSettings,
} from '../config/index.ts';
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

  if (
    !('statusImageUrl' in result) ||
    typeof result.statusImageUrl !== 'string'
  ) {
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
  config: ConfigWithDefaults,
  {
    beforeSha,
    afterSha,
    link,
    message,
    authorEmail,
    notify,
    fallbackShas,
  }: EnvironmentResult,
  logger: Logger,
): Promise<CreateAsyncComparisonResult> {
  if (beforeSha === afterSha) {
    throw new Error(
      `Cannot create an async comparison between the same SHA (beforeSha=${beforeSha}, afterSha=${afterSha})`,
    );
  }

  const body: {
    link: string | undefined;
    message: string | undefined;
    author: string | undefined;
    project: string | undefined;
    isAsync: boolean;
    notify: string | undefined;
    fallbackShas: Array<string> | undefined;
    deepCompare?: DeepCompareSettings;
    blockApproval?: BlockApprovalSettings;
  } = {
    link,
    message,
    author: authorEmail,
    project: config.project,
    isAsync: true,
    notify,
    fallbackShas,
  };

  if (config.deepCompare) {
    body.deepCompare = config.deepCompare;
  }

  if (config.blockApproval) {
    // Conditions that are left out are not sent, so that the server can tell
    // them apart from `false` and fall back to the account's settings.
    body.blockApproval = config.blockApproval;
  }

  const result = await makeHappoAPIRequest(
    {
      path: `/api/reports/${beforeSha}/compare/${afterSha}`,
      method: 'POST',
      body,
    },
    config,
    { retryCount: 3 },
    logger,
  );

  assertResultIsCreateAsyncComparisonResult(result);

  return result;
}
