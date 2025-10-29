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

export async function loadConfigFile(
  configFilePath: string,
): Promise<ConfigWithDefaults> {
  const config = await import(configFilePath);
  if (!config.default.targets) {
    config.default.targets = {
      chrome: {
        browserType: 'chrome',
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
  }
  return {
    endpoint: 'https://happo.io',
    githubApiUrl: 'https://api.github.com',
    targets: allTargets,
    ...config.default,
  };
}
