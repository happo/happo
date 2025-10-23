#!/usr/bin/env node

import path from 'node:path';
import { parseArgs } from 'node:util';

import packageJson from '../../package.json' with { type: 'json' };
import type { ConfigWithDefaults } from '../config/index.ts';
import { findConfigFile, loadConfigFile } from '../config/loadConfig.ts';
import runWithWrapper, { finalizeAll } from '../e2e/wrapper.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import resolveEnvironment from '../environment/index.ts';
import type { Logger } from '../isomorphic/types.ts';
import cancelJob from '../network/cancelJob.ts';
import createAsyncComparison from '../network/createAsyncComparison.ts';
import createAsyncReport from '../network/createAsyncReport.ts';
import prepareSnapRequests from '../network/prepareSnapRequests.ts';
import startJob from '../network/startJob.ts';

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
    },

    allowPositionals: true,
  });

  return {
    ...parsedArgs,
    dashdashCommandParts: parseDashdashCommandParts(rawArgs),
  };
}

const helpText = `Happo ${packageJson.version}
Usage: happo [options]

Commands:
  <default>    Run happo tests
  finalize     Finalize happo report for Cypress/Playwright tests running in parallel

Options:
  --config   Path to happo config file
  --version  Show version number
  --help     Show help text

Examples:
  happo
  happo --config path/to/happo.config.ts
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
    logger.log(packageJson.version);
    return;
  }

  if (args.values.help) {
    logger.log(helpText);
    return;
  }

  // Get config file path (use --config if provided, otherwise find default)
  const configFilePath = makeAbsolute(args.values.config || findConfigFile());
  const config = await loadConfigFile(configFilePath);
  const environment = await resolveEnvironment();

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
    const asyncComparison = await createAsyncComparison(
      false,
      config,
      environment,
      logger,
    );

    logger.log(`[HAPPO] Async report URL: ${asyncReport.url}`);
    logger.log(`[HAPPO] Async comparison URL: ${asyncComparison.compareUrl}`);
  } catch (e) {
    logger.error(e instanceof Error ? e.message : String(e), e);
    await cancelJob('failure', config, environment, logger);
    process.exitCode = 1;
    return;
  }
}

async function handleFinalizeCommand(
  config: ConfigWithDefaults,
  environment: Awaited<ReturnType<typeof resolveEnvironment>>,
  logger: Logger,
): Promise<void> {
  logger.log('Finalizing happo report...');
  logger.log('Config:', config);
  logger.log('Environment:', environment);

  try {
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
  environment: Awaited<ReturnType<typeof resolveEnvironment>>,
  dashdashCommandParts: Array<string>,
  configFilePath: string,
  logger: Logger,
): Promise<void> {
  if (!E2E_INTEGRATION_TYPES.includes(config.integrationType)) {
    logger.error(
      `Unsupported integration type used for e2e command: ${config.integrationType}. Supported integration types for e2e are: ${E2E_INTEGRATION_TYPES.join(', ')}`,
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
