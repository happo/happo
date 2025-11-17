import fs from 'node:fs';

import { any as findAny } from 'empathic/find';

import type { ConfigWithDefaults, TargetWithDefaults } from './index.ts';

const CONFIG_FILENAMES = [
  'happo.config.js',
  'happo.config.mjs',
  'happo.config.cjs',
  'happo.config.ts',
  'happo.config.mts',
  'happo.config.cts',
];

export function findConfigFile(): string {
  if (process.env.HAPPO_CONFIG_FILE) {
    return process.env.HAPPO_CONFIG_FILE;
  }

  const configFilePath = findAny(CONFIG_FILENAMES, { cwd: process.cwd() });

  if (!configFilePath) {
    throw new Error(
      'Happo config file could not be found. Please create a config file in the root of your project.',
    );
  }

  return configFilePath;
}

function validateConfig(config: ConfigWithDefaults) {
  if (!config.apiKey) {
    throw new Error(
      'Missing `apiKey` in your Happo config. Reference yours at https://happo.io/settings',
    );
  }

  if (!config.apiSecret) {
    throw new Error(
      'Missing `apiSecret` in your Happo config. Reference yours at https://happo.io/settings',
    );
  }
}

export async function loadConfigFile(
  configFilePath: string,
): Promise<ConfigWithDefaults> {
  try {
    const stats = await fs.promises.stat(configFilePath);
    if (!stats.isFile()) {
      throw new Error(`Happo config file path is not a file: ${configFilePath}`);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Happo config file could not be found: ${configFilePath}`);
    }

    throw error;
  }

  const config = await import(configFilePath);

  if (!config.default.targets) {
    config.default.targets = {
      chrome: {
        type: 'chrome',
        viewport: '1024x768',
      },
    };
  }

  if (!config.default.integration) {
    config.default.integration = {
      type: 'storybook',
    };
  }

  const allTargets = Object.values(config.default.targets);
  for (const target of allTargets as Array<TargetWithDefaults>) {
    target.viewport = target.viewport || '1024x768';
    target.freezeAnimations = target.freezeAnimations || 'last-frame';
    target.prefersReducedMotion = target.prefersReducedMotion ?? true;
    target.deviceScaleFactor = target.deviceScaleFactor ?? 2;
  }

  const configWithDefaults = {
    endpoint: 'https://happo.io',
    githubApiUrl: 'https://api.github.com',
    targets: allTargets,
    ...config.default,
  };

  validateConfig(configWithDefaults);

  return configWithDefaults;
}
