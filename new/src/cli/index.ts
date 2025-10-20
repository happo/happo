#!/usr/bin/env node

import { parseArgs } from 'node:util';

import packageJson from '../../package.json' with { type: 'json' };
import type { ConfigWithDefaults } from '../config/index.ts';
import { findConfigFile, loadConfigFile } from '../config/loadConfig.ts';
import runWithWrapper, {
  DEFAULT_PORT as DEFAULT_E2E_PORT,
  finalizeAll,
} from '../e2e/wrapper.ts';
import resolveEnvironment from '../environment/index.ts';

function parseDashdashCommandParts(rawArgs: Array<string>): Array<string> {
  const dashdashIndex = rawArgs.indexOf('--');
  if (dashdashIndex === -1) {
    return [];
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

      project: {
        type: 'string',
        default: 'default',
        short: 'p',
      },

      e2eAllowFailures: {
        type: 'boolean',
        default: false,
      },

      e2ePort: {
        type: 'string',
        default: DEFAULT_E2E_PORT,
      },

      e2eSkippedExamples: {
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

const helpText = `Happo ${packageJson.version}
Usage: happo [command]

Commands:
  <default> Run happo tests
  e2e       Set up happo wrapper for Cypress and Playwright

Options:
  --config   Path to happo config file
  --project  Project to run (default: default)
  --version  Show version number
  --help     Show help text

Specific to e2e command:
  --e2eAllowFailures      Allow failures for e2e tests (default: false)
  --e2ePort               Port to listen on for e2e tests (default: ${DEFAULT_E2E_PORT})
  --e2eSkippedExamples    List of skipped examples as JSON

Examples:
  happo
  happo --config path/to/happo.config.ts
  happo --project my-project
  happo --version
  happo --help
  happo e2e -- playwright test
  happo e2e finalize
  happo e2e --e2eAllowFailures -- cypress run
  `;

type Logger = Pick<Console, 'log' | 'error'>;

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
  const configFilePath = args.values.config || findConfigFile();
  const config = await loadConfigFile(configFilePath);
  const environment = await resolveEnvironment();

  // Handle positional arguments (commands)
  const command = args.positionals[0];

  switch (command) {
    case 'e2e': {
      await handleE2ECommand(
        config,
        environment,
        args.positionals,
        args.dashdashCommandParts,
        args.values.e2eAllowFailures,
        args.values.e2ePort,
        args.values.project,
        configFilePath,
        logger,
      );
      break;
    }

    case undefined: {
      // Default command - run happo tests
      await handleDefaultCommand(config, environment, logger);
      break;
    }

    default: {
      logger.error(`Unknown command: ${command}\n`);
      logger.error(helpText);
      process.exitCode = 1;
      return;
    }
  }
}

async function handleDefaultCommand(
  config: ConfigWithDefaults,
  environment: Awaited<ReturnType<typeof resolveEnvironment>>,
  logger: Logger,
): Promise<void> {
  logger.log('Running happo tests...');
  logger.log('Config:', config);
  logger.log('Environment:', environment);
  // TODO: Implement actual test running logic
}

async function handleE2ECommand(
  config: ConfigWithDefaults,
  environment: Awaited<ReturnType<typeof resolveEnvironment>>,
  positionals: Array<string>,
  dashdashCommandParts: Array<string>,
  e2eAllowFailures: boolean,
  e2ePort: string,
  project: string,
  configFilePath: string,
  logger: Logger,
): Promise<void> {
  if (positionals[1] === 'finalize') {
    try {
      await finalizeAll({ happoConfig: config, project, environment, logger });
    } catch (e) {
      logger.error(e instanceof Error ? e.message : String(e), e);
      process.exitCode = 1;
      return;
    }
    process.exitCode = 0;
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
  logger.log('E2E allow failures:', e2eAllowFailures);
  logger.log('E2E port:', e2ePort);

  const exitCode = await runWithWrapper(
    dashdashCommandParts,
    project,
    config,
    environment,
    e2ePort,
    e2eAllowFailures,
    logger,
    configFilePath,
  );
  process.exitCode = exitCode;
}

if (import.meta.main) {
  await main();
}
