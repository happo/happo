import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { any as findAny } from 'empathic/find';

import type { EnvironmentResult } from '../environment/index.ts';
import type { Logger } from '../isomorphic/types.ts';
import fetchWithRetry from '../network/fetchWithRetry.ts';
import { parseConfig } from './configSchema.ts';
import getShortLivedAPIToken from './getShortLivedAPIToken.ts';
import type { ConfigWithDefaults } from './index.ts';

const CONFIG_FILENAMES = [
  'happo.config.js',
  'happo.config.mjs',
  'happo.config.cjs',
  'happo.config.ts',
  'happo.config.mts',
  'happo.config.cts',
];

/**
 * Top-level config options that used to exist but have since been removed.
 * Mapped to the migration advice we want to give when we see one.
 */
const REMOVED_CONFIG_OPTIONS: Record<string, string> = {
  githubApiUrl:
    'Happo posts PR statuses from the server now, including to GitHub Enterprise instances, so the client no longer posts comments at all. Remove the option.',
};

/**
 * Target options that used to exist but have since been removed. Mapped to the
 * migration advice we want to give when we see one.
 */
const REMOVED_TARGET_OPTIONS: Record<string, string> = {
  chunks:
    'Happo now decides how many chunks to use, based on the size of the run. Remove the option and Happo will parallelize for you.',
  useFullPageFallbackForTallScreenshots:
    'Tall screenshots no longer need a full-page fallback. Remove the option.',
};

function assertNoRemovedOptions(
  subject: unknown,
  removedOptions: Record<string, string>,
  configFilePath: string,
  describeOption: (option: string) => string,
): void {
  if (typeof subject !== 'object' || subject === null) {
    return;
  }
  for (const [option, advice] of Object.entries(removedOptions)) {
    if (option in subject && Reflect.get(subject, option) !== undefined) {
      throw new TypeError(
        `The ${describeOption(option)} in config file ${configFilePath} has been removed. ${advice}`,
      );
    }
  }
}

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

async function getFallbackApiToken(
  endpoint: string,
  environment: Pick<EnvironmentResult, 'link' | 'ci'> | undefined,
  logger: Logger,
): Promise<{ key: string; secret: string } | undefined> {
  if (environment?.link) {
    try {
      // Fetch pull request auth
      const pullRequestSecret = await getPullRequestSecret(
        endpoint,
        environment.link,
        logger,
      );
      return {
        key: environment.link,
        secret: pullRequestSecret,
      };
    } catch {
      logger.log(
        `Failed to obtain temporary pull-request token for URL: ${environment.link}`,
      );
    }
  }

  if (!environment?.ci) {
    const shortLivedApiToken = await getShortLivedAPIToken(endpoint, logger);
    return shortLivedApiToken ?? undefined;
  }
  return undefined;
}

export async function loadConfigFile(
  configFilePath: string,
  environment?: Pick<EnvironmentResult, 'link' | 'ci'>,
  logger: Logger = console,
  {
    reportUnknownOptions = true,
  }: {
    /**
     * Set to `false` when the config has already been loaded (and unknown
     * options reported) earlier in the run, to avoid repeating the warnings.
     */
    reportUnknownOptions?: boolean;
  } = {},
): Promise<ConfigWithDefaults> {
  try {
    const stats = await fs.promises.stat(configFilePath);
    if (!stats.isFile()) {
      throw new Error(`Happo config file path is not a file: ${configFilePath}`);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Happo config file could not be found: ${configFilePath}`, {
        cause: error,
      });
    }

    throw error;
  }

  let config: unknown;
  try {
    config = (await import(pathToFileURL(configFilePath).href)).default;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ERR_UNKNOWN_FILE_EXTENSION'
    ) {
      // Older versions of Node don't support .ts files natively, so let's throw
      // a more helpful error message.
      const extension = path.extname(configFilePath);
      throw new TypeError(
        `Your Happo config file ${configFilePath} is using an extension that is not supported by this version of Node.js (${extension}). Please use a newer version of Node.js (22.18.0+ or 24+).`,
        { cause: error },
      );
    }

    throw error;
  }

  if (config === null) {
    throw new TypeError(
      `Your Happo config file ${configFilePath} must have a default export that is an object, got: null.`,
    );
  }

  if (typeof config !== 'object') {
    throw new TypeError(
      `Your Happo config file ${configFilePath} must have a default export that is an object, got: ${typeof config}.`,
    );
  }

  if (Array.isArray(config)) {
    throw new TypeError(
      `Your Happo config file ${configFilePath} must have a default export that is an object, got: array.`,
    );
  }

  assertNoRemovedOptions(
    config,
    REMOVED_CONFIG_OPTIONS,
    configFilePath,
    (option) => `\`${option}\` option`,
  );

  const rawTargets: unknown = 'targets' in config ? config.targets : undefined;
  if (typeof rawTargets === 'object' && rawTargets !== null) {
    for (const [name, target] of Object.entries(rawTargets)) {
      assertNoRemovedOptions(
        target,
        REMOVED_TARGET_OPTIONS,
        configFilePath,
        (option) => `\`${option}\` option on target \`${name}\``,
      );
    }
  }

  const parsedConfig = parseConfig(config, configFilePath, (message) => {
    if (reportUnknownOptions) {
      logger.error(`[HAPPO] ${message}`);
    }
  });

  let { apiKey, apiSecret } = parsedConfig;

  // We read these in here so that they can be passed along to the child process
  // in e2e/wrapper.ts. This allows us to use pull-request authentication
  // without having to make an additional HTTP request.
  if (!apiKey && process.env.HAPPO_API_KEY) {
    apiKey = process.env.HAPPO_API_KEY;
  }
  if (!apiSecret && process.env.HAPPO_API_SECRET) {
    apiSecret = process.env.HAPPO_API_SECRET;
  }

  if (!apiKey || !apiSecret) {
    const missing = [apiKey ? null : 'apiKey', apiSecret ? null : 'apiSecret']
      .filter(Boolean)
      .map((key) => `\`${key}\``)
      .join(' and ');

    logger.log(
      `Missing ${missing} in Happo config. Attempting alternative authentication.`,
    );
    const fallbackApiToken = await getFallbackApiToken(
      parsedConfig.endpoint,
      environment,
      logger,
    );
    if (!fallbackApiToken) {
      throw new Error(
        `Missing ${missing} in your Happo config. Reference yours at https://happo.io/settings`,
      );
    }
    apiKey = fallbackApiToken.key;
    apiSecret = fallbackApiToken.secret;
  }

  return { ...parsedConfig, apiKey, apiSecret };
}
