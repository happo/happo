import path from 'node:path';
import { parseArgs } from 'node:util';

import type { ConfigWithDefaults } from '../config/index.ts';
import { findConfigFile, loadConfigFile } from '../config/loadConfig.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import resolveEnvironment from '../environment/index.ts';
import { validateOnly } from '../isomorphic/parseOnly.ts';
import { validateSkip } from '../isomorphic/parseSkip.ts';
import type { Logger, OnlyItem, SkipItem } from '../isomorphic/types.ts';
import type { ParsedCLIArgs } from './parseOptions.ts';
import { parseOptions } from './parseOptions.ts';
import type { Reporter } from './telemetry.ts';
import { createReporter } from './telemetry.ts';

async function getVersion() {
  const packageJson = await import('../../package.json', {
    with: { type: 'json' },
  });
  return packageJson.default.version;
}

function parseDashdashCommandParts(
  rawArgs: Array<string>,
): Array<string> | undefined {
  const dashdashIndex = rawArgs.indexOf('--');
  if (dashdashIndex === -1) {
    return undefined;
  }
  return rawArgs.slice(dashdashIndex + 1);
}

function levenshtein(a: string, b: string): number {
  const n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, temp, row[j - 1]!);
      prev = temp;
    }
  }

  return row[n]!;
}

function findClosestOption(
  unknownName: string,
  knownNames: ReadonlyArray<string>,
): string | undefined {
  let bestMatch: string | undefined;
  let bestDistance = Infinity;

  for (const known of knownNames) {
    const distance = levenshtein(unknownName, known);
    const threshold = Math.floor(Math.max(unknownName.length, known.length) / 3);
    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = known;
    }
  }

  return bestMatch;
}

function parseRawArgs(rawArgs: Array<string>) {
  try {
    const parsedArgs = parseArgs({
      args: rawArgs,
      options: parseOptions,
      allowPositionals: true,
    });

    return {
      ...parsedArgs,
      dashdashCommandParts: parseDashdashCommandParts(rawArgs),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION'
    ) {
      const match = error.message.match(/^Unknown option '(--[^']+)'/);

      if (match && match[1]) {
        const unknownOption = match[1];
        const suggestion = findClosestOption(
          unknownOption.slice(2),
          Object.keys(parseOptions),
        );

        if (suggestion !== undefined) {
          throw new TypeError(
            `Unknown option: '${unknownOption}'. Did you mean '--${suggestion}'?`,
            { cause: error },
          );
        }
      }
    }
    throw error;
  }
}

const helpText = `Happo ${await getVersion()}
Usage: happo [options]

Commands:
  <default>    Run happo tests
  finalize     Finalize happo report for Cypress/Playwright tests running in parallel
  flake        List reported flakes for a project

Options:
  --config              Path to happo config file
  --version             Show version number
  --help                Show help text
  --baseBranch <branch> Base branch to use for comparison (default: 'origin/main')
  --link <url>          URL to contextualize the comparison (default: auto-detected from CI environment)
  --message <message>   Message to associate with the comparison (default: auto-detected from CI environment)
  --authorEmail <email> Email address of the author of the comparison (default: auto-detected from CI environment)
  --afterSha <sha>      "After" SHA to use for comparison (default: auto-detected from CI environment, or HEAD SHA if not set)
  --beforeSha <sha>     "Before" SHA to use for comparison (default: auto-detected from CI environment)
  --beforeShaTagMatcher <matcher> git tag matcher to use for "before" SHA resolution
  --fallbackShas <shas> Space-, newline- or comma-separated list of fallback shas for compare calls (default: auto-detected from CI environment)
  --fallbackShasCount <count> Number of fallback shas to use for compare calls (default: 50)
  --notify <emails>     One or more (comma-separated) email addresses to notify with results
  --nonce <nonce>       Nonce to use for Cypress/Playwright comparison
  --githubToken <token> GitHub token to use for posting Happo statuses as comments. Use in combination with the \`githubApiUrl\` configuration option. (default: auto-detected from environment)
  --skip <json> JSON array of {component, variant} objects to skip in this run and borrow from the nearest baseline report instead
  --only <json> JSON array of {component} or {storyFile} objects to include in this run (all other stories are skipped); only supported for the Storybook integration

Flake command options:
  --allProjects         List flakes across all projects (default: current project)
  --format <format>     Output format for flake command (default: "human", use "json" for raw output)
  --project <name>      Project to filter flakes for (default: project from config)
  --limit <number>      Limit flake results (default: 100, max: 1000)
  --page <number>       Page number for flakes (default: 1)
  --component <name>    Filter flakes by component name
  --variant <name>      Filter flakes by variant name
  --target <name>       Filter flakes by target name
  --sha <sha>           Filter flakes by before/after sha

Examples:
  happo

  happo --config path/to/happo.config.ts
  happo --baseBranch origin/long-lived-branch
  happo --link https://github.com/happo/happo/pull/123
  happo --message "Add new feature"
  happo --notify me@example.com,you@example.com
  happo --nonce my-unique-nonce
  happo --githubToken {{ secrets.GITHUB_TOKEN }}

  happo --version
  happo --help

  happo -- playwright test

  happo --skip '[{"component":"Button","variant":"Primary"}]'
  happo --only '[{"component":"Button"},{"storyFile":"./src/Input.stories.tsx"}]'

  happo finalize
  happo finalize --nonce my-unique-nonce
  happo finalize --skip '[{"component":"Button","variant":"primary","target":"chrome"}]'

  happo flake
  happo flake --allProjects
  happo flake --format=json
  happo flake --project=test-project --limit=10 --page=2
  happo flake --component=button --variant=primary --target=chrome
  happo flake --sha=ff2df74c1730341240840010c7518b2c1f4b55cb
  `;

function makeAbsolute(configFilePath: string): string {
  if (configFilePath.startsWith('.')) {
    return path.resolve(process.cwd(), configFilePath);
  }
  return configFilePath;
}

function installErrorHandlers(reporter: Reporter, logger: Logger) {
  const unhandledRejectionHandler: NodeJS.UnhandledRejectionListener = (reason) => {
    if (reason instanceof Error) {
      reporter.captureException(reason);
      logger.error(reason.stack || reason.message || String(reason));
    } else {
      reporter.captureException(reason);
      logger.error(`Unhandled rejection (non-Error value): ${String(reason)}`);
    }

    process.exitCode = 1;
    return;
  };

  const uncaughtExceptionHandler: NodeJS.UncaughtExceptionListener = (error) => {
    reporter.captureException(error);
    logger.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  };

  process.on('unhandledRejection', unhandledRejectionHandler);
  process.on('uncaughtException', uncaughtExceptionHandler);

  return () => {
    process.removeListener('unhandledRejection', unhandledRejectionHandler);
    process.removeListener('uncaughtException', uncaughtExceptionHandler);
  };
}

export async function main(
  rawArgs: Array<string> = process.argv,
  logger: Logger = console,
): Promise<void> {
  const reporter = createReporter();
  const uninstallErrorHandlers = installErrorHandlers(reporter, logger);

  try {
    const args = parseRawArgs(rawArgs.slice(2));

    if (args.values.version) {
      // --version
      logger.log(await getVersion());
      return;
    }

    if (args.values.help) {
      // --help
      logger.log(helpText);
      return;
    }

    const environment = await resolveEnvironment(args.values);

    // Get config file path (use --config if provided, otherwise find default)
    const configFilePath = makeAbsolute(args.values.config || findConfigFile());
    const config = await loadConfigFile(configFilePath, environment, logger);

    if (args.values.project !== undefined) {
      config.project = args.values.project;
    }

    // Handle positional arguments (commands)
    const command = args.positionals[0];

    if (args.dashdashCommandParts) {
      let validatedSkipJSON: string | undefined;
      if (environment.skip) {
        try {
          validateSkip(environment.skip);
        } catch (e) {
          logger.error(
            '[HAPPO] Invalid --skip:',
            e instanceof Error ? e.message : String(e),
          );
          process.exitCode = 1;
          return;
        }
        validatedSkipJSON = environment.skip;
      }
      await handleE2ECommand(
        config,
        environment,
        args.dashdashCommandParts,
        configFilePath,
        logger,
        validatedSkipJSON,
      );
      return;
    }

    if (command === 'finalize') {
      await handleFinalizeCommand(config, environment, logger);
      return;
    }

    if (command === 'flake') {
      const flakeOptions: FlakeCommandOptions = {};
      if (args.values.allProjects !== undefined) {
        flakeOptions.allProjects = args.values.allProjects;
      }
      if (args.values.format !== undefined) {
        flakeOptions.format = args.values.format;
      }
      if (args.values.project !== undefined) {
        flakeOptions.project = args.values.project;
      }
      if (args.values.limit !== undefined) {
        flakeOptions.limit = args.values.limit;
      }
      if (args.values.page !== undefined) {
        flakeOptions.page = args.values.page;
      }
      if (args.values.component !== undefined) {
        flakeOptions.component = args.values.component;
      }
      if (args.values.variant !== undefined) {
        flakeOptions.variant = args.values.variant;
      }
      if (args.values.target !== undefined) {
        flakeOptions.target = args.values.target;
      }
      if (args.values.sha !== undefined) {
        flakeOptions.sha = args.values.sha;
      }
      await handleFlakeCommand(config, flakeOptions, logger);
      return;
    }

    if (command === undefined) {
      await handleDefaultCommand(config, environment, logger);
      return;
    }

    logger.error(`Unknown command: ${command}\n`);
    logger.error(helpText);
    process.exitCode = 1;
  } catch (error) {
    await reporter.captureException(error);
    logger.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    uninstallErrorHandlers();
  }
}

async function handleDefaultCommand(
  config: ConfigWithDefaults,
  environment: EnvironmentResult,
  logger: Logger,
): Promise<void> {
  logger.log('Running happo tests...');

  const [startJob, createAsyncComparison, createAsyncReport, prepareSnapRequests] =
    await Promise.all([
      (await import('../network/startJob.ts')).default,
      (await import('../network/createAsyncComparison.ts')).default,
      (await import('../network/createAsyncReport.ts')).default,
      (await import('../network/prepareSnapRequests.ts')).default,
    ]);

  // Tell Happo that we are about to run a job
  await startJob(config, environment, logger);

  try {
    // When --skip is set, first resolve the baseline SHA. If no
    // baseline is found we fall back to a full run (no skipping).
    let skip: Array<SkipItem> | undefined;
    let baselineSha: string | undefined;

    if (environment.skip) {
      const supportedTypes = ['storybook', 'custom'];
      if (!supportedTypes.includes(config.integration.type)) {
        logger.error(
          `[HAPPO] --skip is not supported for integration type '${config.integration.type}'. Supported types: ${supportedTypes.join(', ')}`,
        );
        process.exitCode = 1;
        return;
      }

      try {
        skip = validateSkip(environment.skip);
      } catch (e) {
        logger.error(
          '[HAPPO] Invalid --skip:',
          e instanceof Error ? e.message : String(e),
        );
        process.exitCode = 1;
        return;
      }

      if (
        config.integration.type !== 'storybook' &&
        skip.some((item) => 'storyFile' in item)
      ) {
        logger.error(
          `[HAPPO] storyFile items in --skip are only supported for the storybook integration (current integration: '${config.integration.type}')`,
        );
        process.exitCode = 1;
        return;
      }

      const findBaselineReport = (
        await import('../network/findBaselineReport.ts')
      ).default;
      baselineSha = await findBaselineReport(environment, config, logger);
      if (!baselineSha) {
        logger.log(
          '[HAPPO] No baseline report found for --skip run. Generating a full report instead.',
        );
        skip = undefined;
      }
    }

    // When --only is set, validate and apply it (storybook only).
    let only: Array<OnlyItem> | undefined;

    if (environment.only) {
      if (config.integration.type !== 'storybook') {
        logger.error(
          `[HAPPO] --only is not supported for integration type '${config.integration.type}'. Supported types: storybook`,
        );
        process.exitCode = 1;
        return;
      }

      try {
        only = validateOnly(environment.only);
      } catch (e) {
        logger.error(
          '[HAPPO] Invalid --only:',
          e instanceof Error ? e.message : String(e),
        );
        process.exitCode = 1;
        return;
      }

      // Find a baseline to borrow the excluded stories from, unless --skip
      // already resolved one.
      if (!baselineSha) {
        const findBaselineReport = (
          await import('../network/findBaselineReport.ts')
        ).default;
        baselineSha = await findBaselineReport(environment, config, logger);
        if (!baselineSha) {
          logger.log(
            '[HAPPO] No baseline report found for --only run. Excluded stories will not be borrowed from a baseline.',
          );
        }
      }
    }

    // Prepare the snap requests for the job. This includes bundling static
    // assets and uploading them. Only pass the skip list when we have a
    // baseline to borrow the skipped examples from.
    const { snapRequestIds, resolvedSkip } = await prepareSnapRequests(config, skip, only);

    let allSnapRequestIds = snapRequestIds;

    if (skip && baselineSha) {
      const createExtendsReportSnapRequest = (
        await import('../network/createExtendsReportSnapRequest.ts')
      ).default;
      // Use storybook-resolved skip (storyFile items expanded to component names)
      // if available, otherwise fall back to the raw skip list.
      const extendsRequestId = await createExtendsReportSnapRequest(
        baselineSha,
        resolvedSkip ?? skip,
        config,
      );
      allSnapRequestIds = [...snapRequestIds, extendsRequestId];
    } else if (only && baselineSha && resolvedSkip && resolvedSkip.length > 0) {
      const createExtendsReportSnapRequest = (
        await import('../network/createExtendsReportSnapRequest.ts')
      ).default;
      // resolvedSkip here is the complement of the only list — all components
      // that were excluded and should be borrowed from the baseline.
      const extendsRequestId = await createExtendsReportSnapRequest(
        baselineSha,
        resolvedSkip,
        config,
      );
      allSnapRequestIds = [...snapRequestIds, extendsRequestId];
    }

    // Put together a report from the snap requests.
    const asyncReport = await createAsyncReport(
      allSnapRequestIds,
      config,
      environment,
      logger,
    );

    // Create an async comparison.
    logger.log(`[HAPPO] Async report URL: ${asyncReport.url}`);
    if (environment.beforeSha !== environment.afterSha) {
      const asyncComparison = await createAsyncComparison(
        config,
        environment,
        logger,
      );
      logger.log(`[HAPPO] Async comparison URL: ${asyncComparison.compareUrl}`);

      if (environment.link && environment.githubToken && config.githubApiUrl) {
        // githubToken and githubApiUrl are set which means that we should post
        // a comment to the PR.
        // https://docs.happo.io/docs/continuous-integration#posting-statuses-without-installing-the-happo-github-app
        const postGitHubComment = (await import('../network/postGitHubComment.ts'))
          .default;
        await postGitHubComment({
          authToken: environment.githubToken,
          link: environment.link,
          statusImageUrl: asyncComparison.statusImageUrl,
          compareUrl: asyncComparison.compareUrl,
          githubApiUrl: config.githubApiUrl,
        });
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`${config.integration.type} run failed: ${message}`, e);
    const cancelJob = (await import('../network/cancelJob.ts')).default;
    await cancelJob('failure', message, config, environment, logger);
    process.exitCode = 1;
    return;
  }
}

async function handleFinalizeCommand(
  config: ConfigWithDefaults,
  environment: EnvironmentResult,
  logger: Logger,
): Promise<void> {
  logger.log('Finalizing happo report...');
  logger.log('Config:', config);
  logger.log('Environment:', environment);

  try {
    const finalizeAll = (await import('../e2e/wrapper.ts')).finalizeAll;
    await finalizeAll({ happoConfig: config, environment, logger });
  } catch (e) {
    logger.error(e instanceof Error ? e.message : String(e), e);
    process.exitCode = 1;
    return;
  }
  process.exitCode = 0;
  return;
}

type FlakeCommandOptions = Pick<
  ParsedCLIArgs,
  | 'allProjects'
  | 'format'
  | 'project'
  | 'limit'
  | 'page'
  | 'component'
  | 'variant'
  | 'target'
  | 'sha'
>;

async function handleFlakeCommand(
  config: ConfigWithDefaults,
  {
    allProjects,
    format,
    project: projectOverride,
    limit,
    page,
    component,
    variant,
    target,
    sha,
  }: FlakeCommandOptions,
  logger: Logger,
): Promise<void> {
  if (format && format !== 'json' && format !== 'human') {
    logger.error(
      `Unsupported format: ${format}. Use --format=json for raw JSON output or --format=human for human-readable output.`,
    );
    process.exitCode = 1;
    return;
  }

  const { default: getFlakes, formatFlakeOutput } =
    await import('../network/getFlakes.ts');
  const project = allProjects ? undefined : (projectOverride ?? config.project);
  const flakes = await getFlakes(
    {
      project,
      limit,
      page,
      component,
      variant,
      target,
      sha,
    },
    config,
    logger,
  );

  if (format === 'json') {
    logger.log(JSON.stringify(flakes, null, 2));
    process.exitCode = 0;
    return;
  }

  logger.log(formatFlakeOutput(flakes));
  process.exitCode = 0;
}

const E2E_INTEGRATION_TYPES = ['cypress', 'playwright'];

async function handleE2ECommand(
  config: ConfigWithDefaults,
  environment: EnvironmentResult,
  dashdashCommandParts: Array<string>,
  configFilePath: string,
  logger: Logger,
  skipJSON?: string,
): Promise<void> {
  if (!E2E_INTEGRATION_TYPES.includes(config.integration.type)) {
    logger.error(
      `Unsupported integration type used for e2e command: ${config.integration.type}. Supported integration types for e2e are: ${E2E_INTEGRATION_TYPES.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  if (!dashdashCommandParts || dashdashCommandParts.length === 0) {
    logger.error('Missing command for e2e action');
    logger.error(helpText);
    process.exitCode = 1;
    return;
  }

  logger.log('Setting up happo wrapper for Cypress and Playwright...');
  logger.log('Config:', config);
  logger.log('Environment:', environment);
  logger.log('Dashdash command parts:', dashdashCommandParts);

  const runWithWrapper = (await import('../e2e/wrapper.ts')).default;
  const exitCode = await runWithWrapper(
    dashdashCommandParts,
    config,
    environment,
    logger,
    configFilePath,
    skipJSON,
  );
  process.exitCode = exitCode;
}
