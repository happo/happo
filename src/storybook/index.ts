import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { StorybookIntegration } from '../config/index.ts';
import { isInSkipSet, toSkipSet } from '../isomorphic/parseSkip.ts';
import type { OnlyItem, SkipItem } from '../isomorphic/types.ts';
import getStorybookBuildCommandParts from './getStorybookBuildCommandParts.ts';
import getStorybookVersionFromPackageJson from './getStorybookVersionFromPackageJson.ts';
import resolveStoryFileItems, { type StorybookIndexEntry } from './resolveStoryFileItems.ts';

const { HAPPO_DEBUG } = process.env;

function resolveBuildCommandParts() {
  const version = getStorybookVersionFromPackageJson();

  if (version < 9) {
    throw new Error(
      `Storybook v${version} is not supported. Please update storybook to v9 or later.`,
    );
  }

  return getStorybookBuildCommandParts();
}

async function buildStorybook({
  configDir,
  staticDir,
  outputDir,
}: {
  configDir: string;
  staticDir?: string | undefined;
  outputDir: string;
}): Promise<void> {
  await fs.promises.rm(outputDir, { recursive: true, force: true });

  const buildCommandParts = resolveBuildCommandParts();

  if (!buildCommandParts[0]) {
    throw new Error('Failed to resolve build command parts');
  }

  const params = [
    ...buildCommandParts,
    '--output-dir',
    outputDir,
    '--config-dir',
    configDir,
  ];

  if (staticDir) {
    params.push('--static-dir', staticDir);
  }

  let binary = fs.existsSync('yarn.lock') ? 'yarn' : 'npx';

  if (buildCommandParts[0].includes('node_modules')) {
    binary = buildCommandParts[0];
    params.shift(); // remove binary from params
  }

  if (HAPPO_DEBUG) {
    console.log(`[happo] Using build command \`${binary} ${params.join(' ')}\``);
  }

  return new Promise((resolve, reject) => {
    const spawned = spawn(binary, params, {
      stdio: 'inherit',
      shell: process.platform == 'win32',
    });

    spawned.on('exit', (code) => {
      if (code === 0) {
        try {
          fs.unlinkSync(path.join(outputDir, 'project.json'));
        } catch (error) {
          console.warn(
            `Ignoring error when attempting to remove project.json: ${error}`,
          );
        }
        resolve();
      } else {
        reject(new Error('Failed to build static storybook package'));
      }
    });
  });
}

export interface BuildStorybookPackageResult {
  packageDir: string;
  estimatedSnapsCount?: number;
  resolvedSkip?: Array<{ component: string; variant?: string }>;
}

export default async function buildStorybookPackage({
  configDir = '.storybook',
  staticDir,
  outputDir = '.out',
  usePrebuiltPackage = false,
  skip,
  only,
}: Omit<StorybookIntegration, 'type'> & {
  skip?: Array<SkipItem>;
  only?: Array<OnlyItem>;
}): Promise<BuildStorybookPackageResult> {
  if (!usePrebuiltPackage) {
    await buildStorybook({ configDir, staticDir, outputDir });
  }

  const iframePath = path.join(outputDir, 'iframe.html');
  if (!fs.existsSync(iframePath)) {
    throw new Error(
      'Failed to build static storybook package (missing iframe.html)',
    );
  }

  try {
    const iframeContent = await fs.promises.readFile(iframePath, 'utf8');

    // Read index.json once to compute story count and resolve storyFile items.
    let estimatedSnapsCount: number | undefined;
    let resolvedSkip: Array<{ component: string; variant?: string }> | undefined;
    let resolvedOnly: Array<{ component: string }> | undefined;

    const indexPath = path.join(outputDir, 'index.json');
    try {
      const indexContent = await fs.promises.readFile(indexPath, 'utf8');
      const indexData = JSON.parse(indexContent) as {
        entries?: Record<string, StorybookIndexEntry>;
        stories?: Record<string, StorybookIndexEntry>;
      };
      const entries = indexData.entries ?? indexData.stories ?? {};

      const storyEntries = Object.values(entries).filter((e) => e.type === 'story');
      estimatedSnapsCount = storyEntries.length;

      if (skip !== undefined) {
        resolvedSkip = resolveStoryFileItems(skip, entries);
        // Adjust the count so auto-chunking reflects only the stories that
        // will actually be rendered (skipped examples don't need a chunk slot).
        const skipSet = toSkipSet(resolvedSkip);
        estimatedSnapsCount = storyEntries.filter(
          (e) => !isInSkipSet(skipSet, e.title ?? '', e.name ?? ''),
        ).length;
      }

      if (only !== undefined) {
        resolvedOnly = resolveStoryFileItems(only as Array<SkipItem>, entries).map(
          ({ component }) => ({ component }),
        );
        if (resolvedOnly.length === 0) {
          console.warn(
            '[HAPPO] --only: no matching stories found in Storybook index. Generating a full report instead.',
          );
          resolvedOnly = undefined;
        } else {
          // Adjust the count so auto-chunking reflects only the stories that
          // will actually be rendered (only matching examples need a chunk slot).
          const onlyComponents = new Set(resolvedOnly.map((item) => item.component));
          estimatedSnapsCount = storyEntries.filter((e) =>
            onlyComponents.has(e.title ?? ''),
          ).length;

          // Compute the complement: all components NOT in the only list.
          // These will be borrowed from the baseline via an extends-report.
          const allComponents = new Set<string>();
          for (const e of storyEntries) {
            if (e.title) allComponents.add(e.title);
          }
          resolvedSkip = [...allComponents]
            .filter((c) => !onlyComponents.has(c))
            .map((component) => ({ component }));
        }
      }
    } catch (error) {
      console.warn('[HAPPO] Failed to read Storybook index.json:', error);
      if (skip !== undefined) {
        // Fall back to passing through only component-based items
        resolvedSkip = skip.filter(
          (item): item is { component: string; variant?: string } => 'component' in item,
        );
      }
      if (only !== undefined) {
        // Fall back to component-only items; if none remain, leave resolvedOnly
        // undefined so the browser-side filtering is disabled and a full report
        // is generated rather than an empty one.
        const componentOnly = only.filter(
          (item): item is { component: string } => 'component' in item,
        );
        resolvedOnly = componentOnly.length > 0 ? componentOnly : undefined;
      }
    }

    await fs.promises.writeFile(
      iframePath,
      iframeContent.replace(
        '<head>',
        `<head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <script type="text/javascript">window.__IS_HAPPO_RUN = true;</script>
            <script type="text/javascript">window.happoSkipped = ${JSON.stringify(resolvedSkip ?? []).replaceAll(/<\/script>/gi, String.raw`<\/script>`)};</script>
            <script type="text/javascript">window.happoOnly = ${JSON.stringify(resolvedOnly ?? null).replaceAll(/<\/script>/gi, String.raw`<\/script>`)};</script>
          `,
      ),
    );

    const result: BuildStorybookPackageResult = { packageDir: outputDir };
    if (estimatedSnapsCount != null) {
      result.estimatedSnapsCount = estimatedSnapsCount;
    }
    if (resolvedSkip !== undefined) {
      result.resolvedSkip = resolvedSkip;
    }
    return result;
  } catch (e) {
    console.error(e);
    throw e;
  }
}
