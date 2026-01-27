import path from 'node:path';
import { parseArgs } from 'node:util';

import type { ConfigWithDefaults } from '../config/index.ts';
import { findConfigFile, loadConfigFile } from '../config/loadConfig.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import resolveEnvironment from '../environment/index.ts';
import type { Logger } from '../isomorphic/types.ts';
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

const fallbackOptions = {
  allProjects: {
    type: 'boolean',
  },
  format: {
    type: 'string',
  },
  project: {
    type: 'string',
  },
  limit: {
    type: 'string',
  },
  page: {
    type: 'string',
  },
  component: {
    type: 'string',
  },
  variant: {
    type: 'string',
  },
  target: {
    type: 'string',
  },
  sha: {
    type: 'string',
  },
} as const;

function parseRawArgs(rawArgs: Array<string>) {
  const parsedArgs = parseArgs({
    args: rawArgs,

    options: {
      version: {
        type: 'boolean',
        short: 'v',
      },

      help: {
        type: 'boolean',
        short: 'h',
      },

      config: {
        type: 'string',
        short: 'c',
      },

      baseBranch: {
        type: 'string',
      },

      link: {
        type: 'string',
      },

      message: {
        type: 'string',
      },

      authorEmail: {
        type: 'string',
      },

      afterSha: {
        type: 'string',
      },

      beforeSha: {
        type: 'string',
      },

      fallbackShas: {
        type: 'string',
      },

      fallbackShasCount: {
        type: 'string',
      },

      notify: {
        type: 'string',
      },

      nonce: {
        type: 'string',
      },

      githubToken: {
        type: 'string',
      },

      ...fallbackOptions,
    },

    allowPositionals: true,
  });

  return {
    ...parsedArgs,
    dashdashCommandParts: parseDashdashCommandParts(rawArgs),
  };
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

  happo finalize
  happo finalize --nonce my-unique-nonce

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

    // Handle positional arguments (commands)
    const command = args.positionals[0];

    if (args.dashdashCommandParts) {
      await handleE2ECommand(
        config,
        environment,
        args.dashdashCommandParts,
        configFilePath,
        logger,
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
    // Prepare the snap requests for the job. This includes bundling static
    // assets and uploading them.
    const snapRequestIds = await prepareSnapRequests(config);

    // Put together a report from the snap requests.
    const asyncReport = await createAsyncReport(
      snapRequestIds,
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

type FlakeCommandOptions = {
  allProjects?: boolean;
  format?: string;
  project?: string;
  limit?: string;
  page?: string;
  component?: string;
  variant?: string;
  target?: string;
  sha?: string;
};

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
  if (format && (format !== 'json' && format !== 'human')) {
    logger.error(
      `Unsupported format: ${format}. Use --format=json for raw JSON output or --format=human for human-readable output.`,
    );
    process.exitCode = 1;
    return;
  }

  const { default: getFlakes, formatFlakeOutput } = await import(
    '../network/getFlakes.ts'
  );
  const project = allProjects ? undefined : projectOverride ?? config.project;
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
  );
  process.exitCode = exitCode;
}
