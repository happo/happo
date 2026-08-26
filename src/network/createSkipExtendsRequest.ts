import type { ConfigWithDefaults } from '../config/index.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import type { Logger, SkipItem } from '../isomorphic/types.ts';
import createExtendsReportSnapRequest from './createExtendsReportSnapRequest.ts';
import findBaselineReport from './findBaselineReport.ts';

/**
 * Resolves a skip list into an extends-report snap request that borrows the
 * skipped examples from the nearest baseline report.
 *
 * This is the same mechanism the storybook/custom integrations use for
 * `--skip`: the borrowed snapshots are the real snapshots from the baseline,
 * so the resulting report is complete on its own rather than relying on the
 * comparison to fill in the gaps.
 *
 * Returns undefined when there is nothing to borrow or no baseline report to
 * borrow from. In the latter case the skipped examples will show up as deleted
 * in the comparison, so we log about it.
 */
export default async function createSkipExtendsRequest(
  skip: Array<SkipItem>,
  config: ConfigWithDefaults,
  environment: EnvironmentResult,
  logger: Logger,
): Promise<number | undefined> {
  const componentItems = skip.filter((item) => 'component' in item);

  if (componentItems.length === 0) {
    return undefined;
  }

  const baselineSha = await findBaselineReport(environment, config, logger);

  if (!baselineSha) {
    logger.log(
      '[HAPPO] No baseline report found to borrow skipped examples from. They will show up as deleted in the comparison.',
    );
    return undefined;
  }

  return await createExtendsReportSnapRequest(baselineSha, componentItems, config);
}
