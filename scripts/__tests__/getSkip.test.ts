import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import * as tmpfs from '../../src/test-utils/tmpfs.ts';
import getSkip from '../getSkip.ts';

const INTERACTIVE_STORIES =
  'src/storybook/__tests__/storybook-app/Interactive.stories.ts';
const STORY_STORIES = 'src/storybook/__tests__/storybook-app/Story.stories.ts';

// Days are 0 (Sun) – 6 (Sat). With two story files in the rotation, even days
// skip Interactive.stories.ts and odd days skip Story.stories.ts.
const EVEN_DAY = 2;
const ODD_DAY = 3;

let errors: Array<string>;
const logger = {
  error: (message: string) => {
    errors.push(message);
  },
};

function commitChange(filePath: string, content: string) {
  tmpfs.writeFile(filePath, content);
  tmpfs.exec('git', ['add', filePath]);
  tmpfs.exec('git', ['commit', '-m', `Change ${filePath}`]);
}

function headSha(): string {
  return tmpfs.exec('git', ['rev-parse', 'HEAD']).trim();
}

function writeEvent(event: object): Record<string, string> {
  tmpfs.writeFile('github-event.json', JSON.stringify(event));
  return { GITHUB_EVENT_PATH: tmpfs.fullPath('github-event.json') };
}

/**
 * Sets up origin/main at the current commit and checks out a feature branch
 */
function checkoutBranchFromOriginMain() {
  tmpfs.exec('git', ['remote', 'add', 'origin', tmpfs.fullPath('.git')]);
  tmpfs.exec('git', ['fetch', 'origin']);
  tmpfs.exec('git', ['checkout', '-b', 'feature']);
}

beforeEach(() => {
  errors = [];
  tmpfs.mock({
    [INTERACTIVE_STORIES]: 'export const Interactive = {};',
    [STORY_STORIES]: 'export const Story = {};',
  });
  tmpfs.gitInit();
});

afterEach(() => {
  tmpfs.restore();
});

describe('getSkip', () => {
  it('rotates the component item by day', () => {
    checkoutBranchFromOriginMain();

    assert.deepStrictEqual(getSkip({ day: 0, env: {}, logger })[0], {
      component: 'Stories',
      variant: 'Button With Text [white]',
    });
    assert.deepStrictEqual(getSkip({ day: 6, env: {}, logger })[0], {
      component: 'Stories',
      variant: 'Lazy [white]',
    });
  });

  describe('locally', () => {
    it('rotates the story file by day when no story files changed', () => {
      checkoutBranchFromOriginMain();
      commitChange('README.md', 'Unrelated change');

      assert.deepStrictEqual(getSkip({ day: EVEN_DAY, env: {}, logger })[1], {
        storyFile: `./${INTERACTIVE_STORIES}`,
      });
      assert.deepStrictEqual(getSkip({ day: ODD_DAY, env: {}, logger })[1], {
        storyFile: `./${STORY_STORIES}`,
      });
      assert.deepStrictEqual(errors, []);
    });

    it('does not skip a story file changed since origin/main', () => {
      checkoutBranchFromOriginMain();
      commitChange(STORY_STORIES, 'export const Story = {}; export const New = {};');

      assert.deepStrictEqual(getSkip({ day: ODD_DAY, env: {}, logger })[1], {
        storyFile: `./${INTERACTIVE_STORIES}`,
      });
      assert.deepStrictEqual(getSkip({ day: EVEN_DAY, env: {}, logger })[1], {
        storyFile: `./${INTERACTIVE_STORIES}`,
      });
      assert.deepStrictEqual(errors, [
        '[getSkip] Not skipping story files that changed since the base commit.',
        '[getSkip] Not skipping story files that changed since the base commit.',
      ]);
    });

    it('does not skip any story files when they all changed', () => {
      checkoutBranchFromOriginMain();
      commitChange(STORY_STORIES, 'export const Story = {}; export const New = {};');
      commitChange(INTERACTIVE_STORIES, 'export const Interactive = { play() {} };');

      assert.deepStrictEqual(getSkip({ day: ODD_DAY, env: {}, logger }), [
        { component: 'Stories', variant: 'Portal [white]' },
      ]);
    });

    it('does not skip any story files without an origin/main', () => {
      assert.deepStrictEqual(getSkip({ day: ODD_DAY, env: {}, logger }), [
        { component: 'Stories', variant: 'Portal [white]' },
      ]);
      assert.deepStrictEqual(errors, [
        '[getSkip] Could not determine changed files since the base commit; not skipping any story files.',
      ]);
    });
  });

  describe('on a GitHub pull request', () => {
    it('does not skip a story file changed since the merge base', () => {
      tmpfs.exec('git', ['checkout', '-b', 'feature']);
      commitChange(STORY_STORIES, 'export const Story = {}; export const New = {};');

      // Main moves on after the branch was created. Changes on main are not
      // part of the pull request and don't count.
      tmpfs.exec('git', ['checkout', 'main']);
      commitChange(INTERACTIVE_STORIES, 'export const Interactive = { play() {} };');
      const mainSha = headSha();
      tmpfs.exec('git', ['checkout', 'feature']);

      const env = writeEvent({ pull_request: { base: { sha: mainSha } } });

      assert.deepStrictEqual(getSkip({ day: ODD_DAY, env, logger })[1], {
        storyFile: `./${INTERACTIVE_STORIES}`,
      });
    });
  });

  describe('on a GitHub merge group', () => {
    it('does not skip a story file changed since the base', () => {
      const baseSha = headSha();
      commitChange(STORY_STORIES, 'export const Story = {}; export const New = {};');

      const env = writeEvent({ merge_group: { base_sha: baseSha } });

      assert.deepStrictEqual(getSkip({ day: ODD_DAY, env, logger })[1], {
        storyFile: `./${INTERACTIVE_STORIES}`,
      });
    });
  });

  describe('on a GitHub push', () => {
    it('does not skip a story file changed in the push', () => {
      const beforeSha = headSha();
      commitChange(STORY_STORIES, 'export const Story = {}; export const New = {};');

      const env = writeEvent({ before: beforeSha, ref: 'refs/heads/main' });

      assert.deepStrictEqual(getSkip({ day: ODD_DAY, env, logger })[1], {
        storyFile: `./${INTERACTIVE_STORIES}`,
      });
    });

    it('skips story files changed only in earlier pushes', () => {
      commitChange(STORY_STORIES, 'export const Story = {}; export const New = {};');
      const beforeSha = headSha();
      commitChange('README.md', 'Unrelated change');

      const env = writeEvent({ before: beforeSha, ref: 'refs/heads/main' });

      assert.deepStrictEqual(getSkip({ day: ODD_DAY, env, logger })[1], {
        storyFile: `./${STORY_STORIES}`,
      });
    });

    it('does not skip any story files for a new branch', () => {
      const env = writeEvent({
        before: '0000000000000000000000000000000000000000',
        ref: 'refs/heads/new-branch',
      });

      assert.deepStrictEqual(getSkip({ day: ODD_DAY, env, logger }), [
        { component: 'Stories', variant: 'Portal [white]' },
      ]);
      assert.deepStrictEqual(errors, [
        '[getSkip] Could not determine changed files since the base commit; not skipping any story files.',
      ]);
    });

    it('does not skip any story files when the before commit is missing', () => {
      // e.g. a shallow clone
      const env = writeEvent({
        before: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        ref: 'refs/heads/main',
      });

      assert.deepStrictEqual(getSkip({ day: ODD_DAY, env, logger }), [
        { component: 'Stories', variant: 'Portal [white]' },
      ]);
      assert.deepStrictEqual(errors, [
        '[getSkip] Could not determine changed files since the base commit; not skipping any story files.',
      ]);
    });
  });
});
