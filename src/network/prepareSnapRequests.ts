import fs from 'node:fs';
import path from 'node:path';

import type { ConfigWithDefaults } from '../config/index.ts';
import RemoteBrowserTarget from '../config/RemoteBrowserTarget.ts';
import generateStorybookStaticPackage from '../storybook/index.ts';
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
<html lang="en">
  <head>
    <title>Happo</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body>
    <script src="${entryPoint}"></script>
  </body>
</html>`;

  await fs.promises.mkdir(rootDir, { recursive: true });
  await fs.promises.writeFile(iframePath, iframeContent);
}

async function generateStaticPackage(
  { integration }: ConfigWithDefaults,
  logger: Logger,
): Promise<string> {
  if (integration.type === 'static') {
    const { rootDir, entryPoint } = await integration.generateStaticPackage();
    await createIframeHTML(rootDir, entryPoint, logger);
    return rootDir;
  }

  if (integration.type === 'storybook') {
    return await generateStorybookStaticPackage(integration);
  }

  throw new Error(`Unsupported integration type: ${integration.type}`);
}

async function validateStaticPackage(staticPackageDir: string): Promise<void> {
  const iframePath = path.join(staticPackageDir, 'iframe.html');

  if (!(await fileExists(iframePath))) {
    throw new Error(
      `Could not find iframe.html in static package at '${iframePath}'`,
    );
  }
}

export default async function prepareSnapRequests(
  config: ConfigWithDefaults,
): Promise<Array<number>> {
  const logger = new Logger();
  const staticPackageDir = await generateStaticPackage(config, logger);

  await validateStaticPackage(staticPackageDir);

  const { buffer, hash } = await deterministicArchive([staticPackageDir]);
  const staticPackagePath = await uploadAssets(
    buffer,
    {
      hash,
      logger,
    },
    config,
  );
  const targetNames = Object.keys(config.targets);
  const tl = targetNames.length;
  logger.info(
    `${logTag(config.project)}Generating screenshots in ${tl} target${
      tl > 1 ? 's' : ''
    }...`,
  );
  const outerStartTime = Date.now();
  const results: Array<number> = [];
  await Promise.all(
    targetNames.map(async (name) => {
      const startTime = Date.now();
      if (!config.targets[name]) {
        throw new Error(`Target ${name} not found in config`);
      }
      const target = new RemoteBrowserTarget(
        config.targets[name].browserType,
        config.targets[name],
      );
      const snapRequestIds = await target.execute(
        {
          targetName: name,
          staticPackage: staticPackagePath,
        },
        config,
      );
      logger.start(`  - ${logTag(config.project)}${name}`, { startTime });
      logger.success();
      results.push(...snapRequestIds);
    }),
  );
  logger.start(undefined, { startTime: outerStartTime });
  logger.success();
  return results;
}
