import { any as findAny } from 'empathic/find';

import type { ConfigWithDefaults } from './index.ts';

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
  if (!config.default.projects) {
    config.default.projects = {
      default: {
        integrationType: 'storybook',
        targets: {
          chrome: {
            browserType: 'chrome',
            viewport: '1024x768',
          },
        },
      },
    };
  }
  return {
    endpoint: 'https://happo.io',
    githubApiUrl: 'https://api.github.com',
    ...config.default,
  };
}
