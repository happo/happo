import fs from 'node:fs';
import path from 'node:path';

import type { ConfigWithDefaults } from '../config/index.ts';
import RemoteBrowserTarget from '../config/RemoteBrowserTarget.ts';
import generateStorybookStaticPackage from '../storybook/index.ts';
import deterministicArchive from '../utils/deterministicArchive.ts';
import Logger, { logTag } from '../utils/Logger.ts';
import uploadAssets from './uploadAssets.ts';

async function createIframeHtml(rootDir: string, entryPoint: string): Promise<void> {
  const iframePath = path.join(rootDir, 'iframe.html');
  if (fs.existsSync(iframePath)) {
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
  fs.writeFileSync(iframePath, iframeContent);
}

async function generateStaticPackage({
  integration,
}: ConfigWithDefaults): Promise<string> {
  if (integration.type === 'static') {
    const { rootDir, entryPoint } = await integration.generateStaticPackage();
    await createIframeHtml(rootDir, entryPoint);
    return rootDir;
  }

  if (integration.type === 'storybook') {
    return await generateStorybookStaticPackage(integration);
  }

  throw new Error(`Unsupported integration type: ${integration.type}`);
}

export default async function prepareSnapRequests(
  config: ConfigWithDefaults,
): Promise<Array<number>> {
  const logger = new Logger();
  const staticPackageDir = await generateStaticPackage(config);

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
