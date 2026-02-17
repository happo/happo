import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as tmpfs from '../../test-utils/tmpfs.ts';
import resolveEnvironment from '../index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function commitNewFile(fileName: string, fileContents: string) {
  tmpfs.writeFile(fileName, fileContents);
  tmpfs.exec('git', ['add', fileName]);
  tmpfs.exec('git', ['commit', '-m', `Add ${fileName}`]);
}

function initGitRepo() {
  const origin = tmpfs.fullPath('.git');
  tmpfs.exec('git', ['remote', 'add', 'origin', origin]);

  // Make a second commit in the main branch
  commitNewFile('another-file.txt', 'I like pizza');

  const beforeSha = tmpfs.exec('git', ['rev-parse', 'HEAD']).trim();

  const branch = 'resolve-env-test-branch';

  tmpfs.exec('git', ['checkout', '-b', branch]);
  commitNewFile('new-branch-file.txt', 'I love pizza!');

  const afterSha = tmpfs.exec('git', ['rev-parse', 'HEAD']).trim();

  tmpfs.exec('git', ['fetch', 'origin']);

  return { origin, beforeSha, afterSha, branch };
}

function makeNewBranchAndCommit(fileContents: string) {
  tmpfs.exec('git', ['checkout', '-b', 'some-new-branch']);
  commitNewFile('new-branch-file.txt', fileContents);
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
  it('resolves a local environment', async () => {
    initGitRepo();
    const result = await resolveEnvironment({}, {});
    const afterSha = tmpfs.exec('git', ['rev-parse', 'HEAD']).trim();
    const beforeSha = tmpfs.exec('git', ['rev-parse', 'main']).trim();

    assert.equal(
      result.afterSha,
      afterSha,
      'afterSha is not the same as the current HEAD sha',
    );
    assert.equal(
      result.beforeSha,
      beforeSha,
      'beforeSha is not the same as the main branch sha',
    );
    assert.equal(
      result.message,
      'Add new-branch-file.txt',
      'message is not the commit message of the new-branch-file.txt file',
    );

    // Make a local change
    tmpfs.writeFile('not-checked-in.txt', 'Pizza is good!');
    const result2 = await resolveEnvironment({}, {});

    // After SHA should be different because of the local change
    assert.notEqual(result2.afterSha, afterSha);
    // Before SHA should be the same because we didn't change the branch
    assert.equal(result2.beforeSha, beforeSha);

    // Message should be undefined because we are no longer on a single commit
    assert.equal(result2.message, undefined);

    // Rerun but set `process.env.CI` to `true` to simulate a CI environment
    const result2InCI = await resolveEnvironment(
      {},
      {
        CI: 'true',
      },
    );
    assert.equal(result2InCI.afterSha, afterSha);
    assert.equal(result2InCI.beforeSha, beforeSha);
    assert.notEqual(result2InCI.message, undefined);

    // Make another local change
    tmpfs.writeFile('not-checked-in.txt', 'Pizza is not good at all!');
    const result3 = await resolveEnvironment({}, {});

    // After SHA should be different because of the local change
    assert.notEqual(result3.afterSha, afterSha);
    assert.notEqual(result3.afterSha, result2.afterSha);
    // Before SHA should be the same because we didn't change the branch
    assert.equal(result3.beforeSha, beforeSha);

    // Message should be undefined because we are no longer on a single commit
    assert.equal(result3.message, undefined);

    // Add all changes to the index
    tmpfs.exec('git', ['add', '.']).trim();

    const result4 = await resolveEnvironment({}, {});

    // After SHA should be different because of the local change
    assert.notEqual(result4.afterSha, afterSha);
    // Before SHA should be the same because we didn't change the branch
    assert.equal(result4.beforeSha, beforeSha);

    // Message should be undefined because we are no longer on a single commit
    assert.equal(result4.message, undefined);
  });

  it('resolves the CircleCI environment', async () => {
    const { beforeSha, afterSha } = initGitRepo();

    makeNewBranchAndCommit('CircleCI');

    const circleEnv = {
      CI_PULL_REQUEST: 'https://github.com/happo/happo-view/pull/12',
      CIRCLE_PROJECT_USERNAME: 'happo',
      CIRCLE_PROJECT_REPONAME: 'happo-view',
      CIRCLE_SHA1: afterSha,
    };
    let result = await resolveEnvironment({}, circleEnv);
    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, beforeSha);
    assert.equal(result.link, 'https://github.com/happo/happo-view/pull/12');
    assert.ok(result.message !== undefined);

    // Try with CIRCLE_PULL_REQUEST
    result = await resolveEnvironment(
      {},
      {
        CIRCLE_PULL_REQUEST: 'https://github.com/happo/happo-view/pull/1244',
        CIRCLE_SHA1: afterSha,
      },
    );
    assert.equal(result.afterSha, afterSha);
    assert.equal(result.link, 'https://github.com/happo/happo-view/pull/1244');
    assert.ok(result.message !== undefined);

    // Try with a real commit sha in the repo
    result = await resolveEnvironment(
      {},
      {
        ...circleEnv,
        CIRCLE_SHA1: afterSha,
      },
    );

    assert.equal(result.afterSha, afterSha);
    assert.equal(result.link, 'https://github.com/happo/happo-view/pull/12');
    assert.ok(result.message !== undefined);

    // Try with a non-pr env
    result = await resolveEnvironment(
      {},
      {
        ...circleEnv,
        CI_PULL_REQUEST: undefined,
      },
    );

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
    let result = await resolveEnvironment({}, azureEnv);

    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, beforeSha);
    assert.equal(result.link, `${origin}/pullrequest/99`);
    assert.ok(result.message !== undefined);

    // Try with a non-pr env
    result = await resolveEnvironment(
      {},
      {
        ...azureEnv,
        SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI: undefined,
        SYSTEM_PULLREQUEST_SOURCEBRANCH: undefined,
        SYSTEM_PULLREQUEST_TARGETBRANCH: undefined,
        SYSTEM_PULLREQUEST_PULLREQUESTID: undefined,
      },
    );

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
    };
    let result = await resolveEnvironment(
      {
        beforeShaTagMatcher: 'happo-*',
      },
      azureEnv,
    );
    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, tagSha);

    // Try with a matcher that doesn't match anything. This should fall back to
    // the base branch.
    result = await resolveEnvironment(
      {
        beforeShaTagMatcher: 'happo-dobedoo-*',
      },
      {
        ...azureEnv,
      },
    );

    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, beforeSha);
  });

  it('resolves the GitHub Actions environment', async () => {
    const { beforeSha, afterSha, branch } = initGitRepo();

    // Advance main after branching so the PR base is not the merge-base.
    tmpfs.exec('git', ['checkout', 'main']);
    commitNewFile('main-advance.txt', 'We advanced main');
    const latestMainSha = tmpfs.exec('git', ['rev-parse', 'HEAD']).trim();
    tmpfs.exec('git', ['checkout', branch]);

    const prEventContents = fs.readFileSync(
      path.resolve(__dirname, 'github_pull_request_event.json'),
      'utf8',
    );
    const prEventContentsWithChanges = prEventContents
      .replaceAll('ec26c3e57ca3a959ca5aad62de7213c562f8c821', afterSha)
      .replaceAll('f95f852bd8fca8fcc58a9a2d6c842781e32a215e', latestMainSha);

    tmpfs.writeFile('github_pull_request_event.json', prEventContentsWithChanges);

    const githubEnv = {
      GITHUB_SHA: afterSha,
      GITHUB_EVENT_PATH: tmpfs.fullPath('github_pull_request_event.json'),
    };
    let result = await resolveEnvironment({}, githubEnv);
    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, beforeSha);
    assert.equal(result.link, 'https://github.com/Codertocat/Hello-World/pull/2');
    assert.equal(result.message, 'Update the README with new information.');

    // Try with a push event
    // Copy the event file to the temp dir and update the sha to the current sha
    const pushEventContents = fs.readFileSync(
      path.resolve(__dirname, 'github_push_event.json'),
      'utf8',
    );
    // Replace all the instances of the sha
    const pushEventContentsWithChanges = pushEventContents.replaceAll(
      '0000000000000000000000000000000000000000',
      afterSha,
    );
    const pushEventPath = tmpfs.fullPath('github_push_event.json');
    fs.writeFileSync(pushEventPath, pushEventContentsWithChanges);
    githubEnv.GITHUB_EVENT_PATH = pushEventPath;
    result = await resolveEnvironment({}, githubEnv);
    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, '6113728f27ae82c7b1a177c8d03f9e96e0adf246');
    assert.equal(result.link, `https://github.com/foo/bar/commit/${afterSha}`);
    assert.notEqual(result.message, undefined);

    // Try with a workflow_dispatch event
    githubEnv.GITHUB_EVENT_PATH = path.resolve(
      __dirname,
      'github_workflow_dispatch.json',
    );
    result = await resolveEnvironment({}, githubEnv);
    
    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, afterSha);
    assert.equal(
      result.link,
      `https://github.com/octo-org/octo-repo/commit/${afterSha}`,
    );
    assert.notEqual(result.message, undefined);

    // Try with a non-existing event path
    let caughtError: Error | undefined;
    try {
      await resolveEnvironment(
        {},
        {
          ...githubEnv,
          GITHUB_EVENT_PATH: 'non-existing-path',
        },
      );
    } catch (e) {
      caughtError = e instanceof Error ? e : new Error(String(e));
    }
    assert.ok(caughtError);
    assert.equal(
      caughtError.message,
      'Failed to load GitHub event from the GITHUB_EVENT_PATH environment variable: "non-existing-path"',
    );
  });

  it('resolves the GitHub Actions merge base when the base SHA is missing locally', async () => {
    const originDir = tmpfs.fullPath('origin-repo');
    const actionsDir = tmpfs.fullPath('actions-repo');

    // Step 1: make 70 commits on main.
    tmpfs.exec('git', ['init', '--initial-branch=main', originDir]);
    tmpfs.exec('git', ['-C', originDir, 'config', 'user.name', 'Test User', '--local']);
    tmpfs.exec('git', [
      '-C',
      originDir,
      'config',
      'user.email',
      'test@example.com',
      '--local',
    ]);

    tmpfs.writeFile('origin-repo/README.md', 'commit 1\n');
    tmpfs.exec('git', ['-C', originDir, 'add', '.']);
    tmpfs.exec('git', ['-C', originDir, 'commit', '-m', 'commit 1']);
    const firstSha = tmpfs.exec('git', ['-C', originDir, 'rev-parse', 'HEAD']).trim();

    // Create a branch that represents the PR head, pointing at the first commit.
    tmpfs.exec('git', ['-C', originDir, 'branch', 'pr', firstSha]);

    for (let i = 2; i <= 70; i += 1) {
      tmpfs.exec('git', ['-C', originDir, 'commit', '--allow-empty', '-m', `commit ${i}`]);
    }
    const midMainSha = tmpfs
      .exec('git', ['-C', originDir, 'rev-parse', 'HEAD~35'])
      .trim();
    const latestMainSha = tmpfs.exec('git', ['-C', originDir, 'rev-parse', 'HEAD']).trim();

    // Step 2: checkout only the first commit (PR head) and ensure later commits are missing.
    tmpfs.exec('git', [
      'clone',
      '--no-local',
      '--depth=1',
      '--branch',
      'pr',
      originDir,
      actionsDir,
    ]);

    let showLatestSucceeded = true;
    try {
      tmpfs.exec('git', ['-C', actionsDir, 'show', '--no-patch', latestMainSha]);
    } catch {
      showLatestSucceeded = false;
    }
    assert.equal(showLatestSucceeded, false, 'expected base SHA to be missing locally');

    let showMidSucceeded = true;
    try {
      tmpfs.exec('git', ['-C', actionsDir, 'show', '--no-patch', midMainSha]);
    } catch {
      showMidSucceeded = false;
    }
    assert.equal(showMidSucceeded, false, 'expected mid-history SHA to be missing locally');

    // Step 3: construct a GitHub event json where base.sha is the latest commit on main.
    const prEventTemplate = fs.readFileSync(
      path.resolve(__dirname, 'github_pull_request_event.json'),
      'utf8',
    );
    const prEvent = prEventTemplate
      .replaceAll('ec26c3e57ca3a959ca5aad62de7213c562f8c821', firstSha)
      .replaceAll('f95f852bd8fca8fcc58a9a2d6c842781e32a215e', latestMainSha);
    tmpfs.writeFile('actions-repo/github_event.json', prEvent);
    const eventPath = tmpfs.fullPath('actions-repo/github_event.json');

    // Step 4: resolve the environment and ensure the baseSha has been correctly resolved.
    const previousCwd = process.cwd();
    process.chdir(actionsDir);
    try {
      const result = await resolveEnvironment(
        {},
        {
          GITHUB_SHA: firstSha,
          GITHUB_EVENT_PATH: eventPath,
        },
      );
      assert.equal(result.afterSha, firstSha);
      assert.equal(
        result.beforeSha,
        firstSha,
        'expected beforeSha to resolve to the merge-base (the first commit)',
      );
      assert.notEqual(
        result.beforeSha,
        latestMainSha,
        'expected beforeSha not to fall back to the base SHA from the event',
      );
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('falls back when GitHub Actions merge-base resolution exceeds retry limit', async () => {
    const originDir = tmpfs.fullPath('origin-repo-tries');
    const actionsDir = tmpfs.fullPath('actions-repo-tries');

    // Origin repo with two unrelated histories:
    // - `pr` points to the first commit on `main`
    // - `orphan-base` is an orphan branch (no common ancestor with `main`)
    tmpfs.exec('git', ['init', '--initial-branch=main', originDir]);
    tmpfs.exec('git', ['-C', originDir, 'config', 'user.name', 'Test User', '--local']);
    tmpfs.exec('git', [
      '-C',
      originDir,
      'config',
      'user.email',
      'test@example.com',
      '--local',
    ]);

    tmpfs.writeFile('origin-repo-tries/README.md', 'commit 1\n');
    tmpfs.exec('git', ['-C', originDir, 'add', '.']);
    tmpfs.exec('git', ['-C', originDir, 'commit', '-m', 'commit 1']);
    const prHeadSha = tmpfs.exec('git', ['-C', originDir, 'rev-parse', 'HEAD']).trim();
    tmpfs.exec('git', ['-C', originDir, 'branch', 'pr', prHeadSha]);

    // Create an unrelated root commit on an orphan branch.
    tmpfs.exec('git', ['-C', originDir, 'checkout', '--orphan', 'orphan-base']);
    tmpfs.exec('git', ['-C', originDir, 'rm', '-rf', '.']);
    tmpfs.writeFile('origin-repo-tries/orphan.txt', 'orphan\n');
    tmpfs.exec('git', ['-C', originDir, 'add', '.']);
    tmpfs.exec('git', ['-C', originDir, 'commit', '-m', 'orphan commit']);
    const baseSha = tmpfs.exec('git', ['-C', originDir, 'rev-parse', 'HEAD']).trim();

    // Shallow checkout only the PR head, so `baseSha` is missing locally.
    tmpfs.exec('git', [
      'clone',
      '--no-local',
      '--depth=1',
      '--branch',
      'pr',
      originDir,
      actionsDir,
    ]);

    let baseShaExistsLocally = true;
    try {
      tmpfs.exec('git', ['-C', actionsDir, 'show', '--no-patch', baseSha]);
    } catch {
      baseShaExistsLocally = false;
    }
    assert.equal(baseShaExistsLocally, false, 'expected base SHA to be missing locally');

    // Create PR event with an unreachable base SHA. Merge-base will never resolve,
    // so we should retry up to the limit and then fall back to `baseSha`.
    const prEventTemplate = fs.readFileSync(
      path.resolve(__dirname, 'github_pull_request_event.json'),
      'utf8',
    );
    const prEvent = prEventTemplate
      .replaceAll('ec26c3e57ca3a959ca5aad62de7213c562f8c821', prHeadSha)
      .replaceAll('f95f852bd8fca8fcc58a9a2d6c842781e32a215e', baseSha);
    tmpfs.writeFile('actions-repo-tries/github_event.json', prEvent);
    const eventPath = tmpfs.fullPath('actions-repo-tries/github_event.json');

    const originalConsoleError = console.error;
    const errorMessages: Array<string> = [];
    console.error = (...args: Array<unknown>) => {
      errorMessages.push(args.map(String).join(' '));
    };

    const previousCwd = process.cwd();
    process.chdir(actionsDir);
    try {
      const result = await resolveEnvironment(
        {},
        {
          GITHUB_SHA: prHeadSha,
          GITHUB_EVENT_PATH: eventPath,
          HAPPO_DEBUG: 'true',
        },
      );

      assert.equal(result.afterSha, prHeadSha);

      // We should fall back to the event base SHA when we cannot compute merge-base.
      assert.equal(
        result.beforeSha,
        baseSha,
        'expected beforeSha to fall back to the pull_request.base.sha',
      );

      // Verify we hit the retry limit (10 attempts).
      const retryMessages = errorMessages.filter((m) =>
        m.includes("we failed to resolve the merge base. We'll try fetching"),
      );
      assert.equal(
        retryMessages.length,
        10,
        `expected 10 retry attempts, got ${retryMessages.length}`,
      );
    } finally {
      process.chdir(previousCwd);
      console.error = originalConsoleError;
    }
  });

  it('resolves the GitHub merge group environment', async () => {
    initGitRepo();
    const currentSha = tmpfs.exec('git', ['rev-parse', 'HEAD']).trim();
    const githubEnv = {
      GITHUB_SHA: currentSha,
      GITHUB_EVENT_PATH: path.resolve(__dirname, 'github_merge_group_event.json'),
    };
    const result = await resolveEnvironment({}, githubEnv);
    assert.equal(result.afterSha, 'ec26c3e57ca3a959ca5aad62de7213c562f8c821');
    assert.equal(result.beforeSha, 'f95f852bd8fca8fcc58a9a2d6c842781e32a215e');
    assert.equal(
      result.link,
      'https://github.com/Codertocat/Hello-World/commit/ec26c3e57ca3a959ca5aad62de7213c562f8c821',
    );
  });

  it('resolves the Travis environment', async () => {
    const { beforeSha, afterSha } = initGitRepo();

    makeNewBranchAndCommit('Travis');

    const travisEnv = {
      TRAVIS_REPO_SLUG: 'owner/repo',
      TRAVIS_PULL_REQUEST: '12',
      TRAVIS_PULL_REQUEST_SHA: afterSha,
      TRAVIS_COMMIT_RANGE: `${beforeSha}...${afterSha}`,
      TRAVIS_COMMIT: afterSha,
    };

    let result = await resolveEnvironment({}, travisEnv);
    assert.equal(result.afterSha, afterSha);
    assert.equal(result.beforeSha, beforeSha);
    assert.equal(result.link, `https://github.com/owner/repo/pull/12`);
    assert.ok(result.message !== undefined);

    // Try with a real commit sha in the repo
    result = await resolveEnvironment(
      {
        fallbackShasCount: '5',
      },
      {
        ...travisEnv,
        TRAVIS_PULL_REQUEST_SHA: undefined,
        TRAVIS_PULL_REQUEST: undefined,
        TRAVIS_COMMIT_RANGE: undefined,
        TRAVIS_COMMIT: afterSha,
      },
    );

    assert.equal(result.afterSha, afterSha);
    assert.equal(result.link, `https://github.com/owner/repo/commit/${afterSha}`);

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

  it('rejects if the link is not a valid URL', async () => {
    const link = 'not a url';

    await assert.rejects(resolveEnvironment({ link }, {}), {
      message: `link must be a valid http/https URL. Invalid URL: '${link}'`,
    });
  });

  it('rejects if the link is not a valid http/https URL', async () => {
    const link = 'link://link';

    await assert.rejects(resolveEnvironment({ link }, {}), {
      message: `link must be a valid http/https URL. Invalid protocol: 'link:' (from '${link}')`,
    });
  });

  it('resolves the happo environment', async () => {
    initGitRepo();
    const link = 'https://github.com/happo/happo/pull/123';
    const currentSha = tmpfs.exec('git', ['rev-parse', 'HEAD']).trim();
    const happoEnv = {};

    let result = await resolveEnvironment(
      {
        link,
        message: 'This is a change',
        afterSha: currentSha,
        beforeSha: 'hhhggg',
        notify: 'foo@bar.com,bar@foo.com',
      },
      happoEnv,
    );
    assert.equal(result.afterSha, currentSha);
    assert.equal(result.beforeSha, 'hhhggg');
    assert.equal(result.link, 'https://github.com/happo/happo/pull/123');
    assert.equal(result.notify, 'foo@bar.com,bar@foo.com');
    assert.equal(result.message, 'This is a change');

    // Try overriding base branch
    result = await resolveEnvironment(
      {
        baseBranch: 'non-existing',
        link,
        afterSha: currentSha,
      },
      {
        ...happoEnv,
      },
    );

    assert.equal(result.afterSha, currentSha);
    assert.equal(result.beforeSha, currentSha);
    assert.equal(result.link, 'https://github.com/happo/happo/pull/123');
    assert.ok(result.message !== undefined);

    // Use provided fallbackShas with newlines
    result = await resolveEnvironment(
      {
        link,
        afterSha: currentSha,
        beforeSha: 'hhhggg',
        fallbackShas: '123456\n789012\n345678',
      },
      {
        ...happoEnv,
      },
    );
    assert.deepStrictEqual(result.fallbackShas, ['123456', '789012', '345678']);

    // Use provided fallbackShas with spaces
    result = await resolveEnvironment(
      {
        link,
        afterSha: currentSha,
        beforeSha: 'hhhggg',
        fallbackShas: '123456 789012 345678',
      },
      {
        ...happoEnv,
      },
    );
    assert.deepStrictEqual(result.fallbackShas, ['123456', '789012', '345678']);

    // Use provided fallbackShas with commas
    result = await resolveEnvironment(
      {
        link,
        afterSha: currentSha,
        beforeSha: 'hhhggg',
        fallbackShas: '123456,789012,345678',
      },
      {
        ...happoEnv,
      },
    );
    assert.deepStrictEqual(result.fallbackShas, ['123456', '789012', '345678']);
  });
});
