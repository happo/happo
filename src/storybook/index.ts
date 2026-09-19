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

  if (version < 8) {
    throw new Error(
      `Storybook v${version} is not supported. Please update storybook to v8 or later.`,
    );
  }

  return getStorybookBuildCommandParts();
}

/**
 * Warns when a Storybook was built with `features.developmentModeForBuild`.
 *
 * That flag makes Storybook define `process.env.NODE_ENV` as "development" in
 * a production build, which ships the development build of the framework --
 * for React, roughly twice the bundle and a good deal slower than that to
 * render, since the development build does validation and warning work the
 * production one compiles away. Happo renders every story, so the cost lands
 * on every snapshot in the report.
 *
 * Read out of Storybook's own `project.json` rather than out of `main.ts`.
 * That file records the *resolved* configuration, so this works regardless of
 * how the flag got set and regardless of framework, where parsing an arbitrary
 * TypeScript config would not.
 */
export async function warnIfDevelopmentModeBuild(
  outputDir: string,
): Promise<void> {
  try {
    const raw = await fs.promises.readFile(
      path.join(outputDir, 'project.json'),
      'utf8',
    );
    const project = JSON.parse(raw) as {
      features?: { developmentModeForBuild?: boolean };
    };

    if (project.features?.developmentModeForBuild) {
      console.warn(
        '[HAPPO] This Storybook was built with `features.developmentModeForBuild` ' +
          'enabled, so it ships the development build of your framework. That is ' +
          'substantially slower to render, and Happo renders every story — expect ' +
          'slower jobs and a higher chance of timeouts. Remove the flag from your ' +
          '`.storybook/main` config to build in production mode.',
      );
    }
  } catch {
    // Storybook writes project.json on its own schedule, and a prebuilt
    // package may not carry one at all. A missing or unreadable file means
    // there is nothing to check, and nothing the user could do with the error.
  }
}

/**
 * First Storybook version whose `build` command understands `--preview-only`.
 * Verified against the v8, v9 and v10 CLIs: v8 does not have the flag and
 * fails the build outright when handed it.
 */
const MIN_PREVIEW_ONLY_VERSION = 9;

async function buildStorybook({
  configDir,
  staticDir,
  outputDir,
  previewOnly,
}: {
  configDir: string;
  staticDir?: string | undefined;
  outputDir: string;
  previewOnly?: boolean | undefined;
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

  // On by default: Happo only ever loads iframe.html, so the manager UI is
  // weight nobody asked for unless someone opens the built package by hand.
  if (previewOnly ?? true) {
    if (getStorybookVersionFromPackageJson() < MIN_PREVIEW_ONLY_VERSION) {
      // Ignored rather than fatal: this only ever makes the package smaller,
      // so failing the whole build over it would trade a working report for
      // an optimization. Only worth saying out loud when it was asked for --
      // on the default nobody has done anything to be told about.
      if (previewOnly === true) {
        console.warn(
          `[HAPPO] Ignoring \`previewOnly\` because it needs Storybook v${MIN_PREVIEW_ONLY_VERSION} or later.`,
        );
      }
    } else {
      params.push('--preview-only');
    }
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
      if (code !== 0) {
        reject(new Error('Failed to build static storybook package'));
        return;
      }

      // Has to happen before the unlink below: project.json is where the
      // resolved configuration lives, and we delete it rather than ship it.
      void warnIfDevelopmentModeBuild(outputDir).then(() => {
        try {
          fs.unlinkSync(path.join(outputDir, 'project.json'));
        } catch (error) {
          console.warn(
            `Ignoring error when attempting to remove project.json: ${error}`,
          );
        }
        resolve();
      });
    });
  });
}

/**
 * Name the Happo client runtime is copied under, inside the built package.
 * Distinctive on purpose: it sits next to whatever the user's own build
 * emitted, and must not collide with it.
 */
const HAPPO_RUNTIME_FILENAME = 'happo-storybook-runtime.js';

/**
 * Locates the standalone (IIFE) build of `browser/register.ts`.
 *
 * Two layouts to cover: the published package, where this file is
 * `dist/storybook/index.js` and the runtime sits beside it, and this repo,
 * where tests import `src/storybook/index.ts` directly and the runtime is
 * still only ever produced into `dist/`.
 */
function resolveHappoRuntimeBundle(): string {
  const dirname = import.meta.dirname;
  const candidates = [
    path.resolve(dirname, 'standalone', 'register.js'),
    path.resolve(
      dirname,
      '..',
      '..',
      'dist',
      'storybook',
      'standalone',
      'register.js',
    ),
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `Could not find the Happo Storybook runtime (looked in ${candidates.join(', ')}). ` +
        'This is a bug in the `happo` package — please report it at ' +
        'https://github.com/happo/happo/issues.',
    );
  }

  return found;
}

/**
 * Copies the Happo client runtime into the built package.
 *
 * The runtime is what defines `window.happo`, which is what the Happo worker
 * drives the Storybook with. Shipping it inside the package — rather than
 * relying on the user having added `import 'happo/storybook/register'` to
 * their `.storybook/preview` file — is what makes the integration work
 * without that step.
 *
 * A project that also imports the runtime itself — from `.storybook/preview`,
 * or from a story file reaching for `forceHappoScreenshot` — ends up with a
 * second copy of it in the preview bundle. That is fine, and deliberately so:
 * the two copies share their run state through `globalThis`, so whichever one
 * `window.happo` points at by the time the worker calls it is looking at the
 * same run. See `RegisterState` in `browser/register.ts`.
 */
async function installHappoRuntime(outputDir: string): Promise<void> {
  await fs.promises.copyFile(
    resolveHappoRuntimeBundle(),
    path.join(outputDir, HAPPO_RUNTIME_FILENAME),
  );
}

/**
 * Last look at the package before it is archived and uploaded.
 *
 * Everything checked here fails the same way once the package reaches a
 * worker: the job sits in the queue, renders nothing, and comes back with a
 * timeout or an empty report several minutes later. Checking locally turns
 * that into an error on the developer's own terminal, before any of it is
 * uploaded or any quota is spent.
 */
async function assertPackageIsRenderable(
  outputDir: string,
  {
    checkStoryCount,
    estimatedSnapsCount,
  }: { checkStoryCount: boolean; estimatedSnapsCount: number | undefined },
): Promise<void> {
  const iframeContent = await fs.promises.readFile(
    path.join(outputDir, 'iframe.html'),
    'utf8',
  );

  // The injection above is a literal `<head>` replacement, which silently does
  // nothing against an iframe.html that spells its head tag any other way.
  // Matching the script tag rather than the bare filename keeps a document
  // that merely mentions the name from passing for one that loads it.
  const escapedFilename = HAPPO_RUNTIME_FILENAME.replaceAll('.', String.raw`\.`);
  const runtimeScriptTag = new RegExp(
    String.raw`<script[^>]+src=["']\./` + escapedFilename + String.raw`["']`,
  );
  if (!runtimeScriptTag.test(iframeContent)) {
    throw new Error(
      [
        "Happo could not add its client runtime to your Storybook's iframe.html.",
        '',
        'Without it the Happo worker has nothing to drive your stories with, and the job ' +
          'would fail with "Timed out while waiting for window.happo" several minutes from now.',
        '',
        `The file Happo tried to modify is ${path.join(outputDir, 'iframe.html')}. It is expected ` +
          'to contain a literal `<head>` tag, which this one does not.',
        '',
        'See https://docs.happo.io/docs/storybook#troubleshooting for more details.',
      ].join('\n'),
    );
  }

  if (checkStoryCount && estimatedSnapsCount === 0) {
    throw new Error(
      [
        'Your Storybook built successfully, but it does not contain any stories.',
        '',
        'Happo takes one screenshot per story, so this run would produce an empty report.',
        '',
        'This usually means one of the following:',
        '  - The `stories` globs in your `.storybook/main` config do not match any files.',
        '  - `configDir` in your Happo config points at the wrong Storybook config directory.',
        '',
        'See https://docs.happo.io/docs/storybook#troubleshooting for more details.',
      ].join('\n'),
    );
  }
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
  // Left undefined rather than defaulted here: buildStorybook() needs to tell
  // "asked for it" from "did not say", to decide whether a v8 fallback is
  // worth a warning.
  previewOnly,
  skip,
  only,
}: Omit<StorybookIntegration, 'type'> & {
  skip?: Array<SkipItem>;
  only?: Array<OnlyItem>;
}): Promise<BuildStorybookPackageResult> {
  // A prebuilt package was built elsewhere, so `buildStorybook()` never got to
  // look at it -- check it here instead, since the flag costs the same
  // whoever ran the build. Its project.json is left in place rather than
  // deleted: a package we did not build is not ours to tidy up.
  await (usePrebuiltPackage
    ? warnIfDevelopmentModeBuild(outputDir)
    : buildStorybook({ configDir, staticDir, outputDir, previewOnly }));

  const iframePath = path.join(outputDir, 'iframe.html');
  if (!fs.existsSync(iframePath)) {
    throw new Error(
      'Failed to build static storybook package (missing iframe.html)',
    );
  }

  let built: BuildStorybookPackageResult;

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
        if (only.length === 0) {
          // Empty --only: nothing is rendered locally; every component is
          // borrowed from the baseline via an extends-report.
          const allComponents = new Set<string>();
          for (const e of storyEntries) {
            if (e.title) allComponents.add(e.title);
          }
          resolvedSkip = [...allComponents].map((component) => ({ component }));
          estimatedSnapsCount = 0;
        } else {
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

    await installHappoRuntime(outputDir);

    await fs.promises.writeFile(
      iframePath,
      iframeContent.replace(
        '<head>',
        `<head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <script type="text/javascript">window.__IS_HAPPO_RUN = true;</script>
            <script type="text/javascript">window.happoSkipped = ${JSON.stringify(resolvedSkip ?? []).replaceAll(/<\/script>/gi, String.raw`<\/script>`)};</script>
            <script type="text/javascript">window.happoOnly = ${JSON.stringify(resolvedOnly ?? null).replaceAll(/<\/script>/gi, String.raw`<\/script>`)};</script>
            <script type="text/javascript" src="./${HAPPO_RUNTIME_FILENAME}"></script>
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
    built = result;
  } catch (e) {
    console.error(e);
    throw e;
  }

  // Outside the try on purpose: the catch above logs before rethrowing, and
  // these errors are written to be read once, by the person who ran the CLI.
  await assertPackageIsRenderable(outputDir, {
    // A package built with --skip or --only is *meant* to render fewer
    // stories than it contains, all the way down to none of them, so an
    // empty count says nothing about whether the setup works.
    checkStoryCount: skip === undefined && only === undefined,
    estimatedSnapsCount: built.estimatedSnapsCount,
  });

  return built;
}
