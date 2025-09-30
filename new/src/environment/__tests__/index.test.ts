import assert from 'node:assert';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as tmpfs from '../../test-utils/tmpfs.ts';
import resolveEnvironment from '../index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function initGitRepo() {
  const origin = `${tmpfs.getTempDir()}/.git`;
  tmpfs.exec('git', ['remote', 'add', 'origin', origin]);

  // Make a second commit in the main branch
  tmpfs.writeFile('another-file.txt', 'I like pizza');
  tmpfs.exec('git', ['add', 'another-file.txt']);
  tmpfs.exec('git', ['commit', '-m', 'Add another file']);

  const beforeSha = tmpfs.exec('git', ['rev-parse', 'HEAD']).trim();

  const branch = 'resolve-env-test-branch';

  tmpfs.exec('git', ['checkout', '-b', branch]);
  tmpfs.writeFile('new-branch-file.txt', 'I love pizza!');
  tmpfs.exec('git', ['add', 'new-branch-file.txt']);
  tmpfs.exec('git', ['commit', '-m', 'Add new branch file']);

  const afterSha = tmpfs.exec('git', ['rev-parse', 'HEAD']).trim();

  // Fetch the origin branch at the end to ensure it is up to date with all of
  // the commits in here.
  tmpfs.exec('git', ['fetch', 'origin']);

  return { origin, beforeSha, afterSha, branch };
}

function makeNewBranchAndCommit(fileContents: string) {
  tmpfs.exec('git', ['checkout', '-b', 'some-new-branch']);
  tmpfs.writeFile('new-branch-file.txt', fileContents);
  tmpfs.exec('git', ['add', 'new-branch-file.txt']);
  tmpfs.exec('git', ['commit', '-m', 'Add new branch file']);
}

beforeEach(() => {
  tmpfs.mock({
    'README.md': 'I love pizza!',
  });

  tmpfs.gitInit();
});

afterEach(() => {
  tmpfs.restore();
});

describe('resolveEnvironment', () => {
  it('resolves the dev environment', async () => {
    initGitRepo();
    const result = await resolveEnvironment({});
    assert.equal(result.beforeSha, '__LATEST__');
    assert.ok(/^dev-[a-z0-9]+$/.test(result.afterSha));
    assert.equal(result.link, undefined);
    assert.equal(result.message, undefined);
  });

  it('resolves the CircleCI environment', async () => {
    const { origin, beforeSha, afterSha } = initGitRepo();

    makeNewBranchAndCommit('CircleCI');

    const circleEnv = {
      CI_PULL_REQUEST: `${origin}/pull/12`,
      CIRCLE_PROJECT_USERNAME: 'happo',
      CIRCLE_PROJECT_REPONAME: 'happo-view',
      CIRCLE_SHA1: afterSha,
    };
    let result = await resolveEnvironment(circleEnv);
    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, beforeSha);
    assert.equal(result.link, `${origin}/pull/12`);
    assert.ok(result.message !== undefined);

    // Try with a real commit sha in the repo
    result = await resolveEnvironment({
      ...circleEnv,
      CIRCLE_SHA1: afterSha,
    });

    assert.equal(result.afterSha, afterSha);
    assert.equal(result.link, `${origin}/pull/12`);
    assert.ok(result.message !== undefined);

    // Try with a non-pr env
    result = await resolveEnvironment({
      ...circleEnv,
      CI_PULL_REQUEST: undefined,
    });

    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, beforeSha);
    assert.equal(
      result.link,
      `https://github.com/happo/happo-view/commit/${afterSha}`,
    );
    assert.ok(result.message !== undefined);
  });

  it('resolves the Azure environment', async () => {
    // This would normally be an origin URL like
    // https://trotzig@dev.azure.com/trotzig/_git/happo-demo-azure-full-page
    // but for testing purposes, we use the temp dir as the origin
    const { origin, beforeSha, afterSha, branch } = initGitRepo();

    makeNewBranchAndCommit('Azure');

    const azureEnv = {
      BUILD_SOURCEVERSION: afterSha,
      BUILD_REPOSITORY_URI: origin,
      SYSTEM_PULLREQUEST_PULLREQUESTID: '99',
      SYSTEM_PULLREQUEST_TARGETBRANCH: 'refs/head/main',
      SYSTEM_PULLREQUEST_SOURCEBRANCH: `refs/head/${branch}`,
      SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI: origin,
    };
    let result = await resolveEnvironment(azureEnv);

    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, beforeSha);
    assert.equal(result.link, `${origin}/pullrequest/99`);
    assert.ok(result.message !== undefined);

    // Try with a non-pr env
    result = await resolveEnvironment({
      ...azureEnv,
      SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI: undefined,
      SYSTEM_PULLREQUEST_SOURCEBRANCH: undefined,
      SYSTEM_PULLREQUEST_TARGETBRANCH: undefined,
      SYSTEM_PULLREQUEST_PULLREQUESTID: undefined,
    });

    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, beforeSha);
    assert.equal(result.link, `${origin}/commit/${afterSha}`);
    assert.ok(result.message !== undefined);

    // assert.equal(result.beforeSha, undefined);
    // assert.equal(result.afterSha, 'abcdef');
    // assert.equal(
    //   result.link,
    //   'https://github.com/happo/happo-view/commit/abcdef',
    // );
    // assert.ok(result.message !== undefined);
  });

  it('resolves the tag matching environment', async () => {
    const { origin, beforeSha, afterSha } = initGitRepo();

    makeNewBranchAndCommit('Tag matching');

    // Add a tag to the first commit in the main branch
    tmpfs.exec('git', ['tag', 'happo-test-tag', `${beforeSha}`]);

    const tagSha = tmpfs.exec('git', ['rev-parse', 'happo-test-tag']).trim();

    const azureEnv = {
      BUILD_SOURCEVERSION: afterSha,
      BUILD_REPOSITORY_URI: origin,
      HAPPO_BEFORE_SHA_TAG_MATCHER: 'happo-*',
    };
    let result = await resolveEnvironment(azureEnv);
    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, tagSha);

    // Try with a matcher that doesn't match anything. This should fall back to
    // the base branch.
    result = await resolveEnvironment({
      ...azureEnv,
      HAPPO_BEFORE_SHA_TAG_MATCHER: 'happo-dobedoo-*',
    });

    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, beforeSha);
  });

  it('resolves the GitHub Actions environment', async () => {
    initGitRepo();
    const githubEnv = {
      GITHUB_SHA: 'ccddffddccffdd',
      GITHUB_EVENT_PATH: path.resolve(__dirname, 'github_pull_request_event.json'),
    };
    let result = await resolveEnvironment(githubEnv);
    assert.equal(result.afterSha, 'ec26c3e57ca3a959ca5aad62de7213c562f8c821');
    assert.equal(result.beforeSha, 'f95f852bd8fca8fcc58a9a2d6c842781e32a215e');
    assert.equal(result.link, 'https://github.com/Codertocat/Hello-World/pull/2');
    assert.equal(result.message, 'Update the README with new information.');

    // Try with a push event
    githubEnv.GITHUB_EVENT_PATH = path.resolve(__dirname, 'github_push_event.json');
    result = await resolveEnvironment(githubEnv);
    assert.equal(result.afterSha, '0000000000000000000000000000000000000000');
    assert.equal(result.beforeSha, '6113728f27ae82c7b1a177c8d03f9e96e0adf246');
    assert.equal(
      result.link,
      'https://github.com/foo/bar/commit/0000000000000000000000000000000000000000',
    );
    assert.ok(result.message !== undefined);

    // Try with a workflow_dispatch event
    githubEnv.GITHUB_EVENT_PATH = path.resolve(
      __dirname,
      'github_workflow_dispatch.json',
    );
    result = await resolveEnvironment(githubEnv);
    assert.equal(result.afterSha, 'ccddffddccffdd');
    assert.equal(result.beforeSha, undefined);
    assert.equal(
      result.link,
      'https://github.com/octo-org/octo-repo/commit/ccddffddccffdd',
    );
    assert.ok(result.message !== undefined);

    // Try with a non-existing event path
    let caughtError: Error | undefined;
    try {
      await resolveEnvironment({
        ...githubEnv,
        GITHUB_EVENT_PATH: 'non-existing-path',
      });
    } catch (e) {
      caughtError = e instanceof Error ? e : new Error(String(e));
    }
    assert.ok(caughtError);
    assert.equal(
      caughtError.message,
      'Failed to load GitHub event from the GITHUB_EVENT_PATH environment variable: "non-existing-path"',
    );
  });

  it('resolves the GitHub merge group environment', async () => {
    initGitRepo();
    const githubEnv = {
      GITHUB_SHA: 'ccddffddccffdd',
      GITHUB_EVENT_PATH: path.resolve(__dirname, 'github_merge_group_event.json'),
    };
    const result = await resolveEnvironment(githubEnv);
    assert.equal(result.afterSha, 'ec26c3e57ca3a959ca5aad62de7213c562f8c821');
    assert.equal(result.beforeSha, 'f95f852bd8fca8fcc58a9a2d6c842781e32a215e');
    assert.equal(
      result.link,
      'https://github.com/Codertocat/Hello-World/commit/ec26c3e57ca3a959ca5aad62de7213c562f8c821',
    );
    assert.ok(result.message !== undefined);
  });

  it('resolves the Travis environment', async () => {
    const { origin, beforeSha, afterSha } = initGitRepo();

    makeNewBranchAndCommit('Travis');

    const travisEnv = {
      HAPPO_GITHUB_BASE: origin,
      TRAVIS_REPO_SLUG: 'owner/repo',
      TRAVIS_PULL_REQUEST: '12',
      TRAVIS_PULL_REQUEST_SHA: afterSha,
      TRAVIS_COMMIT_RANGE: `${beforeSha}...${afterSha}`,
      TRAVIS_COMMIT: afterSha,
    };

    let result = await resolveEnvironment(travisEnv);
    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, beforeSha);
    assert.equal(result.link, `${origin}/owner/repo/pull/12`);
    assert.ok(result.message !== undefined);

    // Try with a real commit sha in the repo
    result = await resolveEnvironment({
      ...travisEnv,
      TRAVIS_PULL_REQUEST_SHA: undefined,
      TRAVIS_PULL_REQUEST: undefined,
      TRAVIS_COMMIT_RANGE: undefined,
      TRAVIS_COMMIT: afterSha,
      HAPPO_FALLBACK_SHAS_COUNT: '5',
    });

    assert.equal(result.afterSha, afterSha);
    assert.equal(result.link, `${origin}/owner/repo/commit/${afterSha}`);

    const fallbackShas = tmpfs
      .exec('git', [
        'log',
        '--format=%H',
        '--first-parent',
        `--max-count=5`,
        `${beforeSha}^`,
      ])
      .trim()
      .split('\n');
    assert.ok(fallbackShas.length > 0);

    assert.deepStrictEqual(result.fallbackShas, fallbackShas);
    assert.ok(result.message !== undefined);
  });

  it('resolves the happo environment', async () => {
    initGitRepo();
    const happoEnv = {
      HAPPO_CURRENT_SHA: 'bdac2595db20ad2a6bf335b59510aa771125526a',
      HAPPO_PREVIOUS_SHA: 'hhhggg',
      HAPPO_CHANGE_URL: 'link://link',
      HAPPO_NOTIFY: 'foo@bar.com,bar@foo.com',
    };

    let result = await resolveEnvironment(happoEnv);
    assert.equal(result.afterSha, 'bdac2595db20ad2a6bf335b59510aa771125526a');
    assert.equal(result.beforeSha, 'hhhggg');
    assert.equal(result.link, 'link://link');
    assert.equal(result.notify, 'foo@bar.com,bar@foo.com');
    assert.ok(result.message !== undefined);

    // Try with legacy overrides
    result = await resolveEnvironment({
      CURRENT_SHA: 'foobar',
      PREVIOUS_SHA: 'barfo',
      CHANGE_URL: 'url://link',
      HAPPO_MESSAGE: 'This is a change',
    });

    assert.equal(result.afterSha, 'foobar');
    assert.equal(result.beforeSha, 'barfo');
    assert.equal(result.link, 'url://link');
    assert.equal(result.message, 'This is a change');

    // Try overriding base branch
    result = await resolveEnvironment({
      ...happoEnv,
      HAPPO_BASE_BRANCH: 'non-existing',
      HAPPO_PREVIOUS_SHA: undefined,
    });

    assert.equal(result.afterSha, 'bdac2595db20ad2a6bf335b59510aa771125526a');
    assert.ok(result.beforeSha === undefined);
    assert.equal(result.link, 'link://link');
    assert.ok(result.message !== undefined);

    // Use provided HAPPO_FALLBACK_SHAS
    result = await resolveEnvironment({
      ...happoEnv,
      HAPPO_FALLBACK_SHAS: '123456\n789012\n345678',
    });
    assert.deepStrictEqual(result.fallbackShas, ['123456', '789012', '345678']);

    // Use provided HAPPO_FALLBACK_SHAS with commas
    result = await resolveEnvironment({
      ...happoEnv,
      HAPPO_FALLBACK_SHAS: '123456,789012,345678',
    });
    assert.deepStrictEqual(result.fallbackShas, ['123456', '789012', '345678']);
  });
});
