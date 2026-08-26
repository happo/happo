import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import type { ConfigWithDefaults, E2EIntegration } from '../config/index.ts';
import type { EnvironmentResult } from '../environment/index.ts';
import { validateSkip } from '../isomorphic/parseSkip.ts';
import type { SkipItem } from '../isomorphic/types.ts';
import cancelJob from '../network/cancelJob.ts';
import createAsyncComparison from '../network/createAsyncComparison.ts';
import createSkipExtendsRequest from '../network/createSkipExtendsRequest.ts';
import formatFailureMessage from '../network/formatFailureMessage.ts';
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

type Logger = Pick<Console, 'log' | 'error'>;

interface FinalizeAllOptions {
  happoConfig: ConfigWithDefaults;
  environment: EnvironmentResult;
  logger: Logger;
}

export async function finalizeAll({
  happoConfig,
  environment,
  logger,
}: FinalizeAllOptions): Promise<void> {
  const { afterSha, nonce, skip: skipJSON } = environment;

  if (!nonce) {
    throw new Error('[HAPPO] Missing --nonce argument');
  }

  if (skipJSON) {
    let skip: Array<SkipItem>;
    try {
      skip = validateSkip(skipJSON);
    } catch (e) {
      logger.error('[HAPPO] Invalid --skippedExamples', skipJSON);
      throw e;
    }

    // Borrow the skipped examples from the baseline via an extends-report,
    // the same way the storybook/custom integrations do for --skip. The
    // request is attached to the async report (keyed by nonce) before we
    // finalize, so that the report is complete by the time it is built.
    const extendsRequestId = await createSkipExtendsRequest(
      skip,
      happoConfig,
      environment,
      logger,
    );

    if (extendsRequestId !== undefined) {
      await postAsyncReport([extendsRequestId], environment, happoConfig);
    }
  }

  await makeHappoAPIRequest(
    {
      path: `/api/async-reports/${afterSha}/finalize`,
      method: 'POST',
      body: {
        project: happoConfig.project,
        nonce,
      },
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
  skip?: Array<SkipItem>,
) {
  if (!allRequestIds.size) {
    logger.log(`[HAPPO] No snapshots were recorded. Ignoring.`);
    return;
  }

  const requestIds = [...allRequestIds];

  // Only borrow when this run finalizes the report. With a nonce, the report
  // spans several parallel runs and is finalized by a separate `happo
  // finalize` call — borrowing here would attach one extends-report per shard
  // and duplicate the borrowed snapshots.
  if (skip && skip.length > 0 && !environment.nonce) {
    // Borrow the examples we skipped during the run from the baseline. Without
    // a nonce the report is finalized by the POST below, so the extends-report
    // has to be part of that same call.
    const extendsRequestId = await createSkipExtendsRequest(
      skip,
      happoConfig,
      environment,
      logger,
    );

    if (extendsRequestId !== undefined) {
      requestIds.push(extendsRequestId);
    }
  }

  const reportResult = await postAsyncReport(
    requestIds,
    environment,
    happoConfig,
  );

  if (!reportResult) {
    throw new Error('Failed to create async Happo report');
  }

  const { nonce } = environment;

  if (!nonce && environment.beforeSha !== environment.afterSha) {
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
  skipJSON?: string,
): Promise<number> {
  allRequestIds = new Set<number>();
  const e2eServer = await startE2EServer(environment, happoConfig);
  logger.log(`[HAPPO] Listening on port ${e2eServer.port}`);

  const job = await startJob(happoConfig, environment, logger);
  if (!job) {
    throw new Error('Failed to create Happo job');
  }

  // Write skipped examples to a temp file to avoid env var size limits.
  let skipFilePath: string | undefined;
  let skip: Array<SkipItem> | undefined;
  if (skipJSON) {
    skip = validateSkip(skipJSON);
    skipFilePath = path.join(os.tmpdir(), `happo-skipped-${process.pid}.json`);
    await fs.promises.writeFile(skipFilePath, skipJSON, 'utf8');
  }

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const childEnv: Record<string, string | undefined> = {
        ...process.env,
        HAPPO_E2E_PORT: e2eServer.port.toString(),
        HAPPO_CONFIG_FILE: configFilePath,
        HAPPO_API_KEY: happoConfig.apiKey,
        HAPPO_API_SECRET: happoConfig.apiSecret,
      };

      if (skipFilePath) {
        childEnv.HAPPO_SKIP_FILE = skipFilePath;
      }

      const child = spawn(dashdashCommandParts[0]!, dashdashCommandParts.slice(1), {
        stdio: 'inherit',
        env: childEnv,
        shell: process.platform == 'win32',
      });

      child.on('error', (e) => {
        return reject(e);
      });

      const e2eIntegration = happoConfig.integration;
      assertE2EIntegration(e2eIntegration);
      // `code` is null when the command was terminated by a signal, in which
      // case `signal` says which one.
      child.on(
        'close',
        async (code: number | null, signal: NodeJS.Signals | null) => {
          if (code === 0 || e2eIntegration.allowFailures) {
            try {
              await finalizeHappoReport(
                happoConfig,
                environment,
                job,
                logger,
                skip,
              );
            } catch (e) {
              logger.error('Failed to finalize Happo report', e);
              return reject(e);
            }
          } else {
            const reason =
              code === null
                ? `was terminated by ${signal ?? 'a signal'}`
                : `failed with exit code ${code}`;
            logger.error(
              `[HAPPO] Command ${reason}: ${dashdashCommandParts.join(' ')}. Cancelling Happo job. See the output above for details about the failure.`,
            );
            try {
              await cancelJob(
                'failure',
                formatFailureMessage({
                  integrationType: e2eIntegration.type,
                  command: dashdashCommandParts,
                  exitCode: code ?? undefined,
                  environment,
                }),
                happoConfig,
                environment,
                logger,
              );
            } catch (e) {
              logger.error('Failed to cancel Happo job', e);
              return reject(e);
            }
          }
          // A signal-terminated command has no exit code of its own, but it
          // still needs to fail the happo run.
          resolve(code ?? 1);
        },
      );
    });
    return exitCode;
  } finally {
    allRequestIds.clear();
    await e2eServer.close();
    if (skipFilePath) {
      await fs.promises.unlink(skipFilePath).catch(() => {
        // Ignore errors — the file may already be gone.
      });
    }
  }
}
