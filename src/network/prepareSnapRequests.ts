import fs from 'node:fs';
import path from 'node:path';

import type { ConfigWithDefaults } from '../config/index.ts';
import RemoteBrowserTarget, {
  type ExecuteParams,
} from '../config/RemoteBrowserTarget.ts';
import type { OnlyItem, SkipItem } from '../isomorphic/types.ts';
import buildStorybookPackage from '../storybook/index.ts';
import deterministicArchive from '../utils/deterministicArchive.ts';
import Logger, { logTag } from '../utils/Logger.ts';
import uploadAssets from './uploadAssets.ts';

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.promises.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function createIframeHTML(
  rootDir: string,
  entryPoint: string,
  logger: Logger,
): Promise<void> {
  const iframePath = path.join(rootDir, 'iframe.html');

  if (await fileExists(iframePath)) {
    logger.info(`Using existing iframe.html at '${iframePath}'`);
    return;
  }

  const iframeContent = `<!DOCTYPE html>
<html lang="en" dir="ltr">
  <head>
    <title>Happo</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body>
    <script src="${entryPoint}"></script>
  </body>
</html>`;

  await fs.promises.mkdir(rootDir, { recursive: true });
  await fs.promises.writeFile(iframePath, iframeContent);
}

interface BuildPackageResult {
  packageDir: string;
  estimatedSnapsCount?: number;
  resolvedSkip?: Array<{ component: string; variant?: string }>;
}

async function injectSkippedIntoIframe(
  iframePath: string,
  skipped: Array<SkipItem>,
): Promise<void> {
  const content = await fs.promises.readFile(iframePath, 'utf8');
  const skippedJson = JSON.stringify(skipped).replaceAll(/<\/script>/gi, String.raw`<\/script>`);
  const skippedScript = `<script type="application/json" id="happo-skipped">${skippedJson}</script>`;
  const injected = content.replace(/<head\b[^>]*>/i, (match) => `${match}${skippedScript}`);
  if (injected === content) {
    throw new Error(
      `Failed to inject skipped examples into iframe.html at '${iframePath}': could not find an opening <head> tag`,
    );
  }
  await fs.promises.writeFile(iframePath, injected);
}

async function buildPackage(
  { integration }: ConfigWithDefaults,
  logger: Logger,
  skip?: Array<SkipItem>,
  only?: Array<OnlyItem>,
): Promise<BuildPackageResult> {
  if (integration.type === 'custom') {
    const { rootDir, entryPoint, estimatedSnapsCount } = await integration.build();
    await createIframeHTML(rootDir, entryPoint, logger);

    if (skip && skip.length > 0) {
      const iframePath = path.join(rootDir, 'iframe.html');
      await injectSkippedIntoIframe(iframePath, skip);
    }

    const result: BuildPackageResult = { packageDir: rootDir };
    if (estimatedSnapsCount != null) {
      result.estimatedSnapsCount = estimatedSnapsCount;
    }
    return result;
  }

  if (integration.type === 'storybook') {
    const result = await buildStorybookPackage({
      ...integration,
      ...(skip === undefined ? {} : { skip }),
      ...(only === undefined ? {} : { only }),
    });
    return result;
  }

  throw new Error(`Unsupported integration type: ${integration.type}`);
}

async function validatePackage(packageDir: string): Promise<void> {
  const iframePath = path.join(packageDir, 'iframe.html');

  if (!(await fileExists(iframePath))) {
    throw new Error(
      `Could not find iframe.html in static package at '${iframePath}'`,
    );
  }
}

interface PreparePackageResult {
  packagePath: string;
  estimatedSnapsCount?: number;
  resolvedSkip?: Array<{ component: string; variant?: string }>;
}

async function preparePackage(
  config: ConfigWithDefaults,
  logger: Logger,
  skip?: Array<SkipItem>,
  only?: Array<OnlyItem>,
): Promise<PreparePackageResult> {
  const { packageDir, estimatedSnapsCount, resolvedSkip } = await buildPackage(config, logger, skip, only);

  await validatePackage(packageDir);

  const { buffer, hash } = await deterministicArchive([packageDir]);
  const packagePath = await uploadAssets(
    buffer,
    {
      hash,
      logger,
    },
    config,
  );

  const result: PreparePackageResult = { packagePath };
  if (estimatedSnapsCount != null) {
    result.estimatedSnapsCount = estimatedSnapsCount;
  }
  if (resolvedSkip !== undefined) {
    result.resolvedSkip = resolvedSkip;
  }
  return result;
}

export interface PrepareSnapRequestsResult {
  snapRequestIds: Array<number>;
  resolvedSkip?: Array<{ component: string; variant?: string }>;
}

export default async function prepareSnapRequests(
  config: ConfigWithDefaults,
  skip?: Array<SkipItem>,
  only?: Array<OnlyItem>,
): Promise<PrepareSnapRequestsResult> {
  const logger = new Logger();
  const prepareResult =
    config.integration.type === 'pages'
      ? null
      : await preparePackage(config, logger, skip, only);

  const targetNames = Object.keys(config.targets);
  const tl = targetNames.length;
  logger.info(
    `${logTag(config.project)}Generating screenshots in ${tl} target${
      tl > 1 ? 's' : ''
    }...`,
  );
  const outerStartTime = Date.now();
  const snapRequestIds: Array<number> = [];
  await Promise.all(
    targetNames.map(async (name) => {
      const startTime = Date.now();

      if (!config.targets[name]) {
        throw new Error(`Target ${name} not found in config`);
      }

      const target = new RemoteBrowserTarget(
        config.targets[name].type,
        config.targets[name],
      );

      const targetParams: ExecuteParams = {
        targetName: name,
      };

      if (prepareResult) {
        targetParams.staticPackage = prepareResult.packagePath;

        if (prepareResult.estimatedSnapsCount != null) {
          targetParams.estimatedSnapsCount = prepareResult.estimatedSnapsCount;
        }
      }

      if (config.integration.type === 'pages') {
        targetParams.pages = config.integration.pages;
      }

      const ids = await target.execute(targetParams, config);
      logger.start(`  - ${logTag(config.project)}${name}`, { startTime });
      logger.success();
      snapRequestIds.push(...ids);
    }),
  );
  logger.start(undefined, { startTime: outerStartTime });
  logger.success();
  const result: PrepareSnapRequestsResult = { snapRequestIds };
  if (prepareResult?.resolvedSkip !== undefined) {
    result.resolvedSkip = prepareResult.resolvedSkip;
  }
  return result;
}
