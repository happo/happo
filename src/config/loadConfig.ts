import fs from 'node:fs';

import { any as findAny } from 'empathic/find';

import type { EnvironmentResult } from '../environment/index.ts';
import type { Logger } from '../isomorphic/types.ts';
import fetchWithRetry from '../network/fetchWithRetry.ts';
import type { ConfigWithDefaults, TargetWithDefaults } from './index.ts';

const CONFIG_FILENAMES = [
  'happo.config.js',
  'happo.config.mjs',
  'happo.config.cjs',
  'happo.config.ts',
  'happo.config.mts',
  'happo.config.cts',
];

const DEFAULT_ENDPOINT = 'https://happo.io';

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

function assertIsPullRequestTokenResponse(
  response: unknown,
): asserts response is { secret: string } {
  if (typeof response !== 'object' || response === null || !('secret' in response)) {
    throw new TypeError('Unexpected pull request token response');
  }
}

async function getPullRequestSecret(
  endpoint: string,
  prUrl: string,
  logger: Logger,
): Promise<string> {
  const url = new URL('/api/pull-request-token', endpoint);
  const res = await fetchWithRetry(
    url,
    {
      method: 'POST',
      body: { prUrl },
      retryCount: 3,
    },
    logger,
  );

  if (!res || !res.ok) {
    throw new Error(
      `Failed to get pull request secret: ${res.status} - ${await res.text()}`,
    );
  }

  const json = await res.json();
  assertIsPullRequestTokenResponse(json);

  return json.secret;
}

export async function loadConfigFile(
  configFilePath: string,
  environment?: Pick<EnvironmentResult, 'link'>,
  logger: Logger = console,
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

  const config = (await import(configFilePath)).default;

  // We read these in here so that they can be passed along to the child process
  // in e2e/wrapper.ts. This allows us to use pull-request authentication
  // without having to make an additional HTTP request.
  if (!config.apiKey && process.env.HAPPO_API_KEY) {
    config.apiKey = process.env.HAPPO_API_KEY;
  }
  if (!config.apiSecret && process.env.HAPPO_API_SECRET) {
    config.apiSecret = process.env.HAPPO_API_SECRET;
  }

  if (!config.apiKey || !config.apiSecret) {
    const missing = [
      config.apiKey ? null : 'apiKey',
      config.apiSecret ? null : 'apiSecret',
    ]
      .filter(Boolean)
      .map((key) => `\`${key}\``)
      .join(' and ');

    if (!environment?.link) {
      throw new Error(
        `Missing ${missing} in your Happo config. Reference yours at https://happo.io/settings`,
      );
    }

    try {
      // Reassign API tokens to temporary ones provided for the PR
      logger.log(
        `Missing ${missing} in Happo config. Falling back to pull-request authentication.`,
      );
      config.apiKey = environment.link;
      config.apiSecret = await getPullRequestSecret(
        config.endpoint || DEFAULT_ENDPOINT,
        environment.link,
        logger,
      );
    } catch (e) {
      throw new Error('Failed to obtain temporary pull-request token', { cause: e });
    }
  }

  if (!config.targets) {
    config.targets = {
      chrome: {
        type: 'chrome',
        viewport: '1024x768',
      },
    };
  }

  if (!config.integration) {
    config.integration = {
      type: 'storybook',
    };
  }

  const allTargets = Object.values(config.targets);
  for (const target of allTargets as Array<TargetWithDefaults>) {
    target.viewport = target.viewport || '1024x768';
    target.freezeAnimations = target.freezeAnimations || 'last-frame';
    target.prefersReducedMotion = target.prefersReducedMotion ?? true;
  }

  const configWithDefaults = {
    endpoint: DEFAULT_ENDPOINT,
    githubApiUrl: 'https://api.github.com',
    targets: allTargets,
    ...config,
  };

  return configWithDefaults;
}
