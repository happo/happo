import { spawn } from 'node:child_process';
import http from 'node:http';

import type { ConfigWithDefaults, E2EOptions } from '../config/index.ts';
import resolveEnvironment, { type EnvironmentResult } from '../environment/index.ts';
import makeHappoAPIRequest from '../network/makeHappoAPIRequest.ts';
import postGitHubComment from '../network/postGitHubComment.ts';
import startServer, { type ServerInfo } from '../network/startServer.ts';

let allRequestIds: Set<number>;

interface CompareResult {
  statusImageUrl: string;
  compareUrl: string;
}

function assertCompareResult(
  compareResult: unknown,
): asserts compareResult is CompareResult {
  if (typeof compareResult !== 'object' || compareResult === null) {
    throw new Error('Compare report response is not an object');
  }
  if (
    !('statusImageUrl' in compareResult) ||
    typeof compareResult.statusImageUrl !== 'string'
  ) {
    throw new Error('Compare report response has invalid statusImageUrl');
  }
  if (
    !('compareUrl' in compareResult) ||
    typeof compareResult.compareUrl !== 'string'
  ) {
    throw new Error('Compare report response has invalid compareUrl');
  }
}

async function compareReports(
  sha1: string,
  sha2: string,
  happoConfig: ConfigWithDefaults,
  environment: Awaited<ReturnType<typeof resolveEnvironment>>,
) {
  const compareResult = await makeHappoAPIRequest(
    {
      url: `${happoConfig.endpoint}/api/reports/${sha1}/compare/${sha2}`,
      method: 'POST',
      json: true,
      body: {
        link: environment.link,
        message: environment.message,
        project: happoConfig.project,
        notify: environment.notify,
        fallbackShas: environment.fallbackShas,
        isAsync: true,
      },
    },
    { apiKey: happoConfig.apiKey, apiSecret: happoConfig.apiSecret, retryCount: 2 },
  );
  assertCompareResult(compareResult);
  return compareResult;
}

async function postAsyncReport(
  requestIds: Array<number>,
  environment: EnvironmentResult,
  happoConfig: ConfigWithDefaults,
) {
  const { afterSha, nonce, link, message } = environment;
  return await makeHappoAPIRequest(
    {
      url: `${happoConfig.endpoint}/api/async-reports/${afterSha}`,
      method: 'POST',
      json: true,
      body: {
        requestIds,
        project: happoConfig.project,
        nonce,
        link,
        message,
      },
    },
    { ...happoConfig, retryCount: 2 },
  );
}

type Example = {
  component: string;
  variant: string;
  target: string;
};

type Logger = Pick<Console, 'log' | 'error'>;

interface FinalizeAllOptions {
  happoConfig: ConfigWithDefaults;
  environment: Awaited<ReturnType<typeof resolveEnvironment>>;
  skippedExamplesJSON?: string;
  logger: Logger;
}

export async function finalizeAll({
  happoConfig,
  environment,
  skippedExamplesJSON,
  logger,
}: FinalizeAllOptions): Promise<void> {
  const { beforeSha, afterSha, nonce } = environment;

  if (!nonce) {
    throw new Error('[HAPPO] Missing HAPPO_NONCE environment variable');
  }

  const body: {
    project?: string | undefined;
    nonce: string;
    skippedExamples: Array<Example>;
  } = {
    project: happoConfig.project,
    nonce,
    skippedExamples: [],
  };

  if (skippedExamplesJSON) {
    try {
      const skippedExamples = JSON.parse(skippedExamplesJSON);
      body.skippedExamples = skippedExamples;
    } catch (e) {
      logger.error('Error when parsing --skippedExamples', skippedExamplesJSON);
      throw e;
    }
  }

  await makeHappoAPIRequest(
    {
      url: `${happoConfig.endpoint}/api/async-reports/${afterSha}/finalize`,
      method: 'POST',
      json: true,
      body,
    },
    { ...happoConfig, retryCount: 3 },
  );

  if (beforeSha && beforeSha !== afterSha) {
    const compareResult = await compareReports(
      beforeSha,
      afterSha,
      happoConfig,
      environment,
    );

    if (environment.link && process.env.HAPPO_GITHUB_TOKEN) {
      // HAPPO_GITHUB_TOKEN is set which means that we should post
      // a comment to the PR.
      // https://docs.happo.io/docs/continuous-integration#posting-statuses-without-installing-the-happo-github-app
      await postGitHubComment({
        link: environment.link,
        statusImageUrl: compareResult.statusImageUrl,
        compareUrl: compareResult.compareUrl,
        githubApiUrl: happoConfig.githubApiUrl,
      });
    }
  }
}

async function finalizeHappoReport(
  happoConfig: ConfigWithDefaults,
  environment: EnvironmentResult,
  logger: Logger,
) {
  if (!allRequestIds.size) {
    logger.log(`[HAPPO] No snapshots were recorded. Ignoring.`);
    return;
  }
  const reportResult = await postAsyncReport(
    [...allRequestIds],
    environment,
    happoConfig,
  );

  if (!reportResult) {
    throw new Error('Failed to create async Happo report');
  }

  const { beforeSha, afterSha, link, message, nonce } = environment;

  if (beforeSha) {
    const jobResult = await makeHappoAPIRequest(
      {
        url: `${happoConfig.endpoint}/api/jobs/${beforeSha}/${afterSha}`,
        method: 'POST',
        json: true,
        body: {
          project: happoConfig.project,
          link,
          message,
        },
      },
      { ...happoConfig, retryCount: 2 },
    );

    if (!jobResult) {
      throw new Error('Failed to create Happo job');
    }

    if (beforeSha !== afterSha && !nonce) {
      // If the SHAs match, there is no comparison to make. This is likely
      // running on the default branch and we are done at this point.
      // If there is a nonce, the comparison will happen when the finalize
      // command is called.
      const compareResult = await compareReports(
        beforeSha,
        afterSha,
        happoConfig,
        environment,
      );

      if (environment.link && process.env.HAPPO_GITHUB_TOKEN) {
        // HAPPO_GITHUB_TOKEN is set which means that we should post
        // a comment to the PR.
        // https://docs.happo.io/docs/continuous-integration#posting-statuses-without-installing-the-happo-github-app
        await postGitHubComment({
          link: environment.link,
          statusImageUrl: compareResult.statusImageUrl,
          compareUrl: compareResult.compareUrl,
          githubApiUrl: happoConfig.githubApiUrl,
        });
      }
    }

    if (!('url' in jobResult) || typeof jobResult.url !== 'string') {
      throw new Error('Job result is missing url');
    }
    logger.log(`[HAPPO] ${jobResult.url}`);
  } else {
    if (!('url' in reportResult) || typeof reportResult.url !== 'string') {
      throw new Error('Report result is missing url');
    }
    logger.log(`[HAPPO] ${reportResult.url}`);
  }
}

function startE2EServer(
  environment: Awaited<ReturnType<typeof resolveEnvironment>>,
  happoConfig: ConfigWithDefaults,
): Promise<ServerInfo> {
  function requestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
    const bodyParts: Array<string> = [];
    req.on('data', (chunk: Buffer) => {
      bodyParts.push(chunk.toString());
    });
    req.on('end', async () => {
      const potentialIds = bodyParts
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((requestId) => Number.parseInt(requestId, 10));

      if (potentialIds.some((id) => Number.isNaN(id))) {
        res.writeHead(400);
        res.end('invalid payload');
        return;
      }

      for (const requestId of potentialIds) {
        allRequestIds.add(requestId);
      }

      const { nonce } = environment;
      if (nonce && potentialIds.length) {
        // Associate these snapRequests with the async report as soon as possible
        await postAsyncReport(potentialIds, environment, happoConfig);
      }
      res.writeHead(200);
      res.end('');
    });
  }
  return startServer(requestHandler);
}

function assertE2EIntegration(
  integration: NonNullable<ConfigWithDefaults['integration']>,
): asserts integration is E2EOptions {
  if (integration.type !== 'cypress' && integration.type !== 'playwright') {
    throw new Error(`Unsupported integration type: ${integration.type}`);
  }
  if (!('allowFailures' in integration)) {
    throw new Error(
      `Integration type ${integration.type} does not support allowFailures`,
    );
  }
  if (typeof integration.allowFailures !== 'boolean') {
    throw new TypeError(
      `Integration type ${integration.type} has invalid allowFailures`,
    );
  }
}

/**
 * Runs a command with the wrapper and returns the exit code.
 *
 * @param dashdashCommandParts The command to run with the wrapper
 * @param happoConfig The Happo config
 * @param environment The environment
 * @param port The port to listen on
 * @param logger The logger
 * @returns The exit code of the command
 */
export default async function runWithWrapper(
  dashdashCommandParts: Array<string>,
  happoConfig: ConfigWithDefaults,
  environment: Awaited<ReturnType<typeof resolveEnvironment>>,
  logger: Logger,
  configFilePath: string,
): Promise<number> {
  allRequestIds = new Set<number>();
  const e2eServer = await startE2EServer(environment, happoConfig);
  logger.log(`[HAPPO] Listening on port ${e2eServer.port}`);

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(dashdashCommandParts[0]!, dashdashCommandParts.slice(1), {
        stdio: 'inherit',
        env: {
          ...process.env,
          HAPPO_E2E_PORT: e2eServer.port.toString(),
          HAPPO_CONFIG_FILE: configFilePath,
        },
        shell: process.platform == 'win32',
      });

      child.on('error', (e) => {
        return reject(e);
      });

      const e2eIntegration = happoConfig.integration;
      assertE2EIntegration(e2eIntegration);
      child.on('close', async (code: number) => {
        if (code === 0 || e2eIntegration.allowFailures) {
          try {
            await finalizeHappoReport(happoConfig, environment, logger);
          } catch (e) {
            logger.error('Failed to finalize Happo report', e);
            return reject(e);
          }
        } else if (environment.beforeSha) {
          logger.error(
            'Command failed with exit code ${code}. Cancelling Happo job.',
          );
          try {
            await makeHappoAPIRequest(
              {
                url: `${happoConfig.endpoint}/api/jobs/${environment.beforeSha}/${environment.afterSha}/cancel`,
                method: 'POST',
                json: true,
                body: {
                  status: 'failure',
                  project: happoConfig.project,
                  link: environment.link,
                  message: `${e2eIntegration.type} run failed`,
                },
              },
              { ...happoConfig, retryCount: 3 },
            );
          } catch (e) {
            logger.error('Failed to cancel Happo job', e);
            return reject(e);
          }
        }
        resolve(code);
      });
    });
    return exitCode;
  } finally {
    allRequestIds.clear();
    await e2eServer.close();
  }
}
