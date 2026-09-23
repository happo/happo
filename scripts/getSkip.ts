/**
 * Outputs a --skip JSON argument with up to two items, cycling through a set
 * of examples based on the current day of the week so that different examples
 * are skipped on each day.
 *
 * - One item uses the `component` form to skip a specific variant.
 * - One item uses the `storyFile` form to skip all stories in a file.
 *
 * Skipped examples are borrowed from the baseline report, so skipping a story
 * file that changed since the baseline would carry stale snapshots forward
 * (and silently drop any stories added to it). Real usage only skips files
 * that are unchanged, so only story files unchanged since the base commit are
 * candidates for the `storyFile` item. If the changed files can't be
 * determined, no `storyFile` item is output.
 *
 * Usage:
 *   node scripts/getSkip.ts
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

type SkipItem = { component: string; variant: string } | { storyFile: string };

const componentExamples = [
  { component: 'Stories', variant: 'Button With Text [white]' },
  { component: 'Stories', variant: 'Misc Large [white]' },
  { component: 'Stories', variant: 'Button Firefox Only [white]' },
  { component: 'Stories', variant: 'Portal [white]' },
  { component: 'Stories', variant: 'Button With Image [white]' },
  { component: 'Stories', variant: 'Button With Some Emoji [white]' },
  { component: 'Stories', variant: 'Lazy [white]' },
];

const storyFileExamples = [
  { storyFile: './src/storybook/__tests__/storybook-app/Interactive.stories.ts' },
  { storyFile: './src/storybook/__tests__/storybook-app/Story.stories.ts' },
];

function git(args: Array<string>): string | undefined {
  const res = spawnSync('git', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    return undefined;
  }
  return res.stdout.trim();
}

/**
 * The commit that the baseline report for this run is expected to come from:
 * the merge base for pull requests, and the previous head for pushes to main.
 */
function resolveBaseSha(
  env: Record<string, string | undefined>,
): string | undefined {
  const { GITHUB_EVENT_PATH } = env;

  if (GITHUB_EVENT_PATH) {
    const event = JSON.parse(fs.readFileSync(GITHUB_EVENT_PATH, 'utf8'));

    if (event.pull_request) {
      return git(['merge-base', event.pull_request.base.sha, 'HEAD']);
    }

    if (event.merge_group) {
      return event.merge_group.base_sha;
    }

    // A push to a new branch has an all-zero `before`
    if (event.before && !/^0+$/.test(event.before)) {
      return event.before;
    }

    return undefined;
  }

  return git(['merge-base', 'origin/main', 'HEAD']);
}

function resolveChangedFiles(
  env: Record<string, string | undefined>,
): Set<string> | undefined {
  const baseSha = resolveBaseSha(env);
  if (!baseSha) {
    return undefined;
  }

  const output = git(['diff', '--name-only', baseSha, 'HEAD']);
  if (output === undefined) {
    return undefined;
  }

  return new Set(output.split('\n').filter(Boolean));
}

export default function getSkip({
  day,
  env,
  logger = console,
}: {
  /** 0 (Sun) – 6 (Sat) */
  day: number;
  env: Record<string, string | undefined>;
  logger?: Pick<Console, 'error'>;
}): Array<SkipItem> {
  const componentItem = componentExamples[day % componentExamples.length];
  if (!componentItem) {
    throw new Error(`Invalid day: ${day}`);
  }

  const changedFiles = resolveChangedFiles(env);
  if (!changedFiles) {
    logger.error(
      '[getSkip] Could not determine changed files since the base commit; not skipping any story files.',
    );
    return [componentItem];
  }

  const unchangedStoryFileExamples = storyFileExamples.filter(
    ({ storyFile }) => !changedFiles.has(storyFile.replace(/^\.\//, '')),
  );

  if (unchangedStoryFileExamples.length < storyFileExamples.length) {
    logger.error(
      '[getSkip] Not skipping story files that changed since the base commit.',
    );
  }

  const storyFileItem =
    unchangedStoryFileExamples[day % Math.max(unchangedStoryFileExamples.length, 1)];

  return storyFileItem ? [componentItem, storyFileItem] : [componentItem];
}

if (import.meta.main) {
  process.stdout.write(
    JSON.stringify(getSkip({ day: new Date().getDay(), env: process.env })),
  );
}
