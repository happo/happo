import { spawn } from 'node:child_process';
import http from 'node:http';

import type { ConfigWithDefaults, E2EIntegration } from '../config/index.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import cancelJob from '../network/cancelJob.ts';
import createAsyncComparison from '../network/createAsyncComparison.ts';
import makeHappoAPIRequest from '../network/makeHappoAPIRequest.ts';
import postGitHubComment from '../network/postGitHubComment.ts';
import startJob, { type StartJobResult } from '../network/startJob.ts';
import startServer, { type ServerInfo } from '../network/startServer.ts';

let allRequestIds: Set<number>;

async function postAsyncReport(
  requestIds: Array<number>,
  environment: EnvironmentResult,
  happoConfig: ConfigWithDefaults,
) {
  const { afterSha, nonce, link, message } = environment;
  return await makeHappoAPIRequest(
    {
      path: `/api/async-reports/${afterSha}`,
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
    happoConfig,
    { retryCount: 2 },
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
  environment: EnvironmentResult;
  skippedExamplesJSON?: string;
  logger: Logger;
}

export async function finalizeAll({
  happoConfig,
  environment,
  skippedExamplesJSON,
  logger,
}: FinalizeAllOptions): Promise<void> {
  const { afterSha, nonce } = environment;

  if (!nonce) {
    throw new Error('[HAPPO] Missing --nonce argument');
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
      path: `/api/async-reports/${afterSha}/finalize`,
      method: 'POST',
      json: true,
      body,
    },
    happoConfig,
    { retryCount: 3 },
  );

  if (environment.beforeSha !== environment.afterSha) {
    const compareResult = await createAsyncComparison(
      happoConfig,
      environment,
      logger,
    );

    if (environment.link && environment.githubToken && happoConfig.githubApiUrl) {
      // githubToken and githubApiUrl are set which means that we should post
      // a comment to the PR.
      // https://docs.happo.io/docs/continuous-integration#posting-statuses-without-installing-the-happo-github-app
      await postGitHubComment({
        authToken: environment.githubToken,
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
  job: StartJobResult,
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

  const { nonce } = environment;

  if (!nonce) {
    // If there is a nonce, the comparison will happen when the finalize
    // command is called.
    const compareResult = await createAsyncComparison(
      happoConfig,
      environment,
      logger,
    );

    if (
      compareResult &&
      environment.link &&
      environment.githubToken &&
      happoConfig.githubApiUrl
    ) {
      // githubToken and githubApiUrl is set which means that we should post
      // a comment to the PR.
      // https://docs.happo.io/docs/continuous-integration#posting-statuses-without-installing-the-happo-github-app
      await postGitHubComment({
        authToken: environment.githubToken,
        link: environment.link,
        statusImageUrl: compareResult.statusImageUrl,
        compareUrl: compareResult.compareUrl,
        githubApiUrl: happoConfig.githubApiUrl,
      });
    }
  }
  logger.log(`[HAPPO] ${job.url}`);
}

function startE2EServer(
  environment: EnvironmentResult,
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
): asserts integration is E2EIntegration {
  if (integration.type !== 'cypress' && integration.type !== 'playwright') {
    throw new Error(`Unsupported integration type: ${integration.type}`);
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
  environment: EnvironmentResult,
  logger: Logger,
  configFilePath: string,
): Promise<number> {
  allRequestIds = new Set<number>();
  const e2eServer = await startE2EServer(environment, happoConfig);
  logger.log(`[HAPPO] Listening on port ${e2eServer.port}`);

  const job = await startJob(happoConfig, environment, logger);
  if (!job) {
    throw new Error('Failed to create Happo job');
  }
  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(dashdashCommandParts[0]!, dashdashCommandParts.slice(1), {
        stdio: 'inherit',
        env: {
          ...process.env,
          HAPPO_E2E_PORT: e2eServer.port.toString(),
          HAPPO_CONFIG_FILE: configFilePath,
          HAPPO_API_KEY: happoConfig.apiKey,
          HAPPO_API_SECRET: happoConfig.apiSecret,
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
            await finalizeHappoReport(happoConfig, environment, job, logger);
          } catch (e) {
            logger.error('Failed to finalize Happo report', e);
            return reject(e);
          }
        } else {
          logger.error(
            'Command failed with exit code ${code}. Cancelling Happo job.',
          );
          try {
            await cancelJob(
              'failure',
              `${e2eIntegration.type} run failed`,
              happoConfig,
              environment,
              logger,
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
