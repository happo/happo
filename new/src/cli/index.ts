#!/usr/bin/env node

import { parseArgs } from 'node:util';

import packageJson from '../../package.json' with { type: 'json' };
import type { ConfigWithDefaults } from '../config/index.ts';
import { findConfigFile, loadConfigFile } from '../config/loadConfig.ts';
import resolveEnvironment from '../environment/index.ts';

function parseRawArgs(rawArgs: Array<string>) {
  return parseArgs({
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
}

const helpText = `Happo ${packageJson.version}
Usage: happo [command]

Commands:
  e2e      Set up happo wrapper for Cypress and Playwright
  test     Run happo tests
  version  Show version number`;

export async function main(rawArgs: Array<string> = process.argv): Promise<void> {
  const args = parseRawArgs(rawArgs.slice(2));
  // Handle --version flag
  if (args.values.version) {
    console.log(packageJson.version);
    return;
  }

  if (args.values.help) {
    console.log(helpText);
    return;
  }

  // Get config file path (use --config if provided, otherwise find default)
  const configFilePath = args.values.config || findConfigFile();
  const config = await loadConfigFile(configFilePath);
  const environment = await resolveEnvironment();

  // Handle positional arguments (commands)
  const command = args.positionals[0];

  switch (command) {
    case 'e2e':
      await handleE2ECommand(config, environment);
      break;
    case undefined:
      // Default command - run happo tests
      await handleDefaultCommand(config, environment);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.error(helpText);
      process.exit(1);
  }
}

async function handleDefaultCommand(
  config: ConfigWithDefaults,
  environment: Awaited<ReturnType<typeof resolveEnvironment>>,
): Promise<void> {
  console.log('Running happo tests...');
  console.log('Config:', config);
  console.log('Environment:', environment);
  // TODO: Implement actual test running logic
}

async function handleE2ECommand(
  config: ConfigWithDefaults,
  environment: Awaited<ReturnType<typeof resolveEnvironment>>,
): Promise<void> {
  console.log('Setting up happo wrapper for Cypress and Playwright...');
  console.log('Config:', config);
  console.log('Environment:', environment);
  // TODO: Implement e2e setup logic
}

if (import.meta.main) {
  await main();
}
