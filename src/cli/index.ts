#!/usr/bin/env node

import path from 'node:path';
import { parseArgs } from 'node:util';

import type { ConfigWithDefaults } from '../config/index.ts';
import { findConfigFile, loadConfigFile } from '../config/loadConfig.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import resolveEnvironment from '../environment/index.ts';
import type { Logger } from '../isomorphic/types.ts';

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

Options:
  --config              Path to happo config file
  --version             Show version number
  --help                Show help text
  --baseBranch <branch> Base branch to use for comparison (default: origin/main)
  --link <url>          URL to contextualize the comparison (default: auto-detected from CI environment)
  --message <message>   Message to associate with the comparison (default: auto-detected from CI environment)

Examples:
  happo

  happo --config path/to/happo.config.ts
  happo --baseBranch origin/long-lived-branch
  happo --link https://github.com/happo/happo/pull/123
  happo --message "Add new feature"

  happo --version
  happo --help

  happo -- playwright test

  happo finalize
  `;

function makeAbsolute(configFilePath: string): string {
  if (configFilePath.startsWith('.')) {
    return path.resolve(process.cwd(), configFilePath);
  }
  return configFilePath;
}

export async function main(
  rawArgs: Array<string> = process.argv,
  logger: Logger = console,
): Promise<void> {
  const args = parseRawArgs(rawArgs.slice(2));
  // Handle --version flag
  if (args.values.version) {
    logger.log(await getVersion());
    return;
  }

  if (args.values.help) {
    logger.log(helpText);
    return;
  }

  // Get config file path (use --config if provided, otherwise find default)
  const configFilePath = makeAbsolute(args.values.config || findConfigFile());
  const config = await loadConfigFile(configFilePath);
  const environment = await resolveEnvironment(args.values);

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

  if (command === undefined) {
    await handleDefaultCommand(config, environment, logger);
    return;
  }

  logger.error(`Unknown command: ${command}\n`);
  logger.error(helpText);
  process.exitCode = 1;
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
    }
  } catch (e) {
    logger.error(e instanceof Error ? e.message : String(e), e);
    const cancelJob = (await import('../network/cancelJob.ts')).default;
    await cancelJob('failure', config, environment, logger);
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

if (import.meta.main) {
  await main();
}
