import { spawn } from 'node:child_process';
import http from 'node:http';

import type { ConfigWithDefaults } from '../config/index.ts';
import resolveEnvironment, { type EnvironmentResult } from '../environment/index.ts';
import postGitHubComment from '../network/postGitHubComment.ts';
import makeRequest from '../utils/makeRequest.ts';

let allRequestIds: Set<number>;

export const DEFAULT_PORT = '5339';

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
  project: string,
  happoConfig: ConfigWithDefaults,
  environment: Awaited<ReturnType<typeof resolveEnvironment>>,
) {
  const compareResult = await makeRequest(
    {
      url: `${happoConfig.endpoint}/api/reports/${sha1}/compare/${sha2}`,
      method: 'POST',
      json: true,
      body: {
        link: environment.link,
        message: environment.message,
        project,
        notify: environment.notify,
        fallbackShas: environment.fallbackShas,
      },
    },
    { apiKey: happoConfig.apiKey, apiSecret: happoConfig.apiSecret, retryCount: 2 },
  );
  assertCompareResult(compareResult);
  return compareResult;
}

async function postAsyncReport(
  requestIds: Array<number>,
  project: string,
  environment: EnvironmentResult,
  happoConfig: ConfigWithDefaults,
) {
  const { afterSha, nonce, link, message } = environment;
  return await makeRequest(
    {
      url: `${happoConfig.endpoint}/api/async-reports/${afterSha}`,
      method: 'POST',
      json: true,
      body: {
        requestIds,
        project,
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
  project: string;
  environment: Awaited<ReturnType<typeof resolveEnvironment>>;
  skippedExamplesJSON?: string;
  logger: Logger;
}

export async function finalizeAll({
  happoConfig,
  project,
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
    project,
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

  await makeRequest(
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
      project,
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
  project: string,
  environment: EnvironmentResult,
  logger: Logger,
) {
  if (!allRequestIds.size) {
    logger.log(`[HAPPO] No snapshots were recorded. Ignoring.`);
    return;
  }
  const reportResult = await postAsyncReport(
    [...allRequestIds],
    project,
    environment,
    happoConfig,
  );

  if (!reportResult) {
    throw new Error('Failed to create async Happo report');
  }

  const { beforeSha, afterSha, link, message, nonce } = environment;

  if (beforeSha) {
    const jobResult = await makeRequest(
      {
        url: `${happoConfig.endpoint}/api/jobs/${beforeSha}/${afterSha}`,
        method: 'POST',
        json: true,
        body: {
          project,
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
        project,
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

function startServer(
  port: string,
  project: string,
  environment: Awaited<ReturnType<typeof resolveEnvironment>>,
  happoConfig: ConfigWithDefaults,
): Promise<() => Promise<void>> {
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
        await postAsyncReport(potentialIds, project, environment, happoConfig);
      }
      res.writeHead(200);
      res.end('');
    });
  }
  const server = http.createServer(requestHandler);
  return new Promise<() => Promise<void>>((resolve) => {
    server.listen(port, () => {
      async function closeServer() {
        await new Promise<void>((res, rej) => {
          server.close((err) => {
            if (err) rej(err);
            else {
              res();
            }
          });
        });
      }
      resolve(closeServer);
    });
  });
}

/**
 * Runs a command with the wrapper and returns the exit code.
 *
 * @param dashdashCommandParts The command to run with the wrapper
 * @param happoConfig The Happo config
 * @param environment The environment
 * @param port The port to listen on
 * @param allowFailures Whether to allow failures
 * @param logger The logger
 * @returns The exit code of the command
 */
export default async function runWithWrapper(
  dashdashCommandParts: Array<string>,
  project: string,
  happoConfig: ConfigWithDefaults,
  environment: Awaited<ReturnType<typeof resolveEnvironment>>,
  port: string = DEFAULT_PORT,
  allowFailures: boolean,
  logger: Logger,
  configFilePath: string,
): Promise<number> {
  allRequestIds = new Set<number>();
  const closeServer = await startServer(port, project, environment, happoConfig);
  logger.log(`[HAPPO] Listening on port ${port}`);

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(dashdashCommandParts[0]!, dashdashCommandParts.slice(1), {
        stdio: 'inherit',
        env: {
          ...process.env,
          HAPPO_E2E_PORT: port,
          HAPPO_CONFIG_FILE: configFilePath,
          HAPPO_PROJECT: project,
        },
        shell: process.platform == 'win32',
      });

      child.on('error', (e) => {
        return reject(e);
      });

      child.on('close', async (code: number) => {
        if (code === 0 || allowFailures) {
          try {
            await finalizeHappoReport(happoConfig, project, environment, logger);
          } catch (e) {
            logger.error('Failed to finalize Happo report', e);
            return reject(e);
          }
        }
        resolve(code);
      });
    });
    return exitCode;
  } finally {
    allRequestIds.clear();
    await closeServer();
  }
}
