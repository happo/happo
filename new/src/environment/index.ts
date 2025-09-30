import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

interface GitHubEvent {
  pull_request?: {
    html_url: string;
    title: string;
    base: { sha: string };
    head: { sha: string };
  };
  head_commit?: {
    url: string;
  };
  merge_group?: {
    head_sha: string;
    base_sha: string;
  };
  repository?: {
    html_url: string;
  };
  before?: string;
  after?: string;
}

export interface EnvironmentResult {
  link: string | undefined;
  message: string | undefined;
  beforeSha: string | undefined;
  afterSha: string;
  nonce: string | undefined;
  debugMode: boolean;
  notify: string | undefined;
  fallbackShas: Array<string> | undefined;
}

const envKeys: ReadonlyArray<string> = [
  'BASE_BRANCH',
  'CHANGE_URL',
  'CIRCLE_PROJECT_REPONAME',
  'CIRCLE_PROJECT_USERNAME',
  'CIRCLE_SHA1',
  'CI_PULL_REQUEST',
  'CURRENT_SHA',
  'GITHUB_BASE',
  'HAPPO_BASE_BRANCH',
  'HAPPO_CHANGE_URL',
  'HAPPO_CURRENT_SHA',
  'HAPPO_DEBUG',
  'HAPPO_GITHUB_BASE',
  'HAPPO_PREVIOUS_SHA',
  'HAPPO_FALLBACK_SHAS',
  'HAPPO_FALLBACK_SHAS_COUNT',
  'PREVIOUS_SHA',
  'TRAVIS_COMMIT',
  'TRAVIS_PULL_REQUEST',
  'TRAVIS_PULL_REQUEST_SHA',
  'TRAVIS_REPO_SLUG',
  'TRAVIS_COMMIT_RANGE',
  'BUILD_SOURCEVERSION',
  'BUILD_REPOSITORY_URI',
  'SYSTEM_PULLREQUEST_PULLREQUESTID',
  'SYSTEM_PULLREQUEST_SOURCEBRANCH',
  'SYSTEM_PULLREQUEST_TARGETBRANCH',
  'SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI',
];

async function resolveGithubEvent(GITHUB_EVENT_PATH: string): Promise<GitHubEvent> {
  try {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(GITHUB_EVENT_PATH, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    throw new Error(
      `Failed to load GitHub event from the GITHUB_EVENT_PATH environment variable: ${JSON.stringify(GITHUB_EVENT_PATH)}`,
      { cause: e },
    );
  }
}

async function resolveLink(
  env: Record<string, string | undefined>,
): Promise<string | undefined> {
  const {
    CHANGE_URL,
    HAPPO_CHANGE_URL,
    CI_PULL_REQUEST,
    HAPPO_GITHUB_BASE,
    GITHUB_BASE,
    TRAVIS_REPO_SLUG,
    TRAVIS_PULL_REQUEST,
    TRAVIS_COMMIT,
    CIRCLE_PROJECT_USERNAME,
    CIRCLE_PROJECT_REPONAME,
    CIRCLE_SHA1,
    GITHUB_EVENT_PATH,
    GITHUB_SHA,
    SYSTEM_PULLREQUEST_PULLREQUESTID,
    SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI,
    BUILD_REPOSITORY_URI,
    BUILD_SOURCEVERSION,
  } = env;

  if (HAPPO_CHANGE_URL) {
    // new happo env
    return HAPPO_CHANGE_URL;
  }
  if (CHANGE_URL) {
    // legacy happo env
    return CHANGE_URL;
  }
  if (CI_PULL_REQUEST) {
    // Circle CI
    return CI_PULL_REQUEST;
  }

  if (GITHUB_EVENT_PATH) {
    const ghEvent = await resolveGithubEvent(GITHUB_EVENT_PATH);

    if (ghEvent.pull_request) {
      return ghEvent.pull_request.html_url;
    }
    if (ghEvent.head_commit) {
      return ghEvent.head_commit.url;
    }
    if (ghEvent.merge_group && ghEvent.repository) {
      return `${ghEvent.repository.html_url}/commit/${ghEvent.merge_group.head_sha}`;
    }
    if (GITHUB_SHA && ghEvent.repository) {
      return `${ghEvent.repository.html_url}/commit/${GITHUB_SHA}`;
    }
  }

  if (SYSTEM_PULLREQUEST_PULLREQUESTID && SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI) {
    return `${SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI}/pullrequest/${SYSTEM_PULLREQUEST_PULLREQUESTID}`.replace(
      /[^/]+@/,
      '',
    );
  }

  if (BUILD_REPOSITORY_URI && BUILD_SOURCEVERSION) {
    return `${BUILD_REPOSITORY_URI}/commit/${BUILD_SOURCEVERSION}`.replace(
      /[^/]+@/,
      '',
    );
  }

  const githubBase = HAPPO_GITHUB_BASE || GITHUB_BASE || 'https://github.com';

  if (TRAVIS_REPO_SLUG && TRAVIS_PULL_REQUEST) {
    return `${githubBase}/${TRAVIS_REPO_SLUG}/pull/${TRAVIS_PULL_REQUEST}`;
  }

  if (TRAVIS_REPO_SLUG && TRAVIS_COMMIT) {
    return `${githubBase}/${TRAVIS_REPO_SLUG}/commit/${TRAVIS_COMMIT}`;
  }

  if (CIRCLE_PROJECT_USERNAME && CIRCLE_PROJECT_REPONAME && CIRCLE_SHA1) {
    return `${githubBase}/${CIRCLE_PROJECT_USERNAME}/${CIRCLE_PROJECT_REPONAME}/commit/${CIRCLE_SHA1}`;
  }

  return undefined;
}

async function resolveMessage(
  env: Record<string, string | undefined>,
): Promise<string | undefined> {
  const { GITHUB_EVENT_PATH, HAPPO_MESSAGE } = env;

  if (HAPPO_MESSAGE) {
    return HAPPO_MESSAGE;
  }
  if (GITHUB_EVENT_PATH) {
    const ghEvent = await resolveGithubEvent(GITHUB_EVENT_PATH);
    if (ghEvent.pull_request) {
      return ghEvent.pull_request.title;
    }
  }

  const res = spawnSync('git', ['log', '-1', '--pretty=%s'], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    return undefined;
  }
  return res.stdout.split('\n')[0];
}

function resolveShaFromTagMatcher(tagMatcher: string): string | undefined {
  const res = spawnSync(
    'git',
    ['tag', '--list', tagMatcher, '--sort', 'refname', '--no-contains'],
    {
      encoding: 'utf8',
    },
  );
  if (res.status !== 0) {
    throw new Error(
      `Failed to list git tags when matching against HAPPO_BEFORE_SHA_TAG_MATCHER. Error: ${res.stderr}`,
    );
  }
  const rawAllTags = res.stdout.trim();
  if (!rawAllTags.length) {
    return undefined;
  }
  const allTags = rawAllTags.split('\n');
  const tag = allTags.at(-1);

  if (!tag) {
    throw new Error('No tag found matching the pattern');
  }

  const commitRes = spawnSync('git', ['rev-list', '-n', '1', tag], {
    encoding: 'utf8',
  });
  if (commitRes.status !== 0) {
    throw new Error(
      `Failed to resolve commit sha from tag "${tag}". Error: ${res.stderr}`,
    );
  }
  return commitRes.stdout.trim();
}

async function resolveBeforeSha(
  env: Record<string, string | undefined>,
  afterSha: string,
): Promise<string | undefined> {
  const {
    HAPPO_PREVIOUS_SHA,
    HAPPO_BEFORE_SHA_TAG_MATCHER,
    PREVIOUS_SHA,
    HAPPO_BASE_BRANCH,
    TRAVIS_COMMIT_RANGE,
    GITHUB_EVENT_PATH,
    SYSTEM_PULLREQUEST_TARGETBRANCH,

    // legacy
    BASE_BRANCH,
  } = env;

  if (HAPPO_PREVIOUS_SHA) {
    return HAPPO_PREVIOUS_SHA;
  }

  if (PREVIOUS_SHA) {
    return PREVIOUS_SHA;
  }

  if (HAPPO_BEFORE_SHA_TAG_MATCHER) {
    const resolvedSha = resolveShaFromTagMatcher(HAPPO_BEFORE_SHA_TAG_MATCHER);
    if (resolvedSha) {
      return resolvedSha;
    }
  }

  if (afterSha.startsWith('dev-')) {
    // The afterSha has been auto-generated. Use the special __LATEST__ sha in
    // these cases, forcing a comparison against the latest approved report.
    return '__LATEST__';
  }

  if (GITHUB_EVENT_PATH) {
    const ghEvent = await resolveGithubEvent(GITHUB_EVENT_PATH);
    if (ghEvent.pull_request) {
      return ghEvent.pull_request.base.sha;
    }
    if (ghEvent.merge_group) {
      return ghEvent.merge_group.base_sha;
    }
    return ghEvent.before;
  }

  if (TRAVIS_COMMIT_RANGE) {
    const [first] = TRAVIS_COMMIT_RANGE.split('...');
    return first;
  }

  let baseAzureBranch;
  if (SYSTEM_PULLREQUEST_TARGETBRANCH) {
    baseAzureBranch = [
      'origin',
      SYSTEM_PULLREQUEST_TARGETBRANCH.split('/').toReversed()[0],
    ].join('/');
  }

  const baseBranch =
    HAPPO_BASE_BRANCH || BASE_BRANCH || baseAzureBranch || 'origin/main';
  const res = spawnSync('git', ['merge-base', baseBranch, afterSha], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    console.error(`[HAPPO] Ignored error when resolving base commit: ${res.stderr}`);
    return undefined;
  }
  return res.stdout.split('\n')[0];
}

async function resolveAfterSha(
  env: Record<string, string | undefined>,
): Promise<string> {
  const {
    HAPPO_CURRENT_SHA,
    CURRENT_SHA,
    CIRCLE_SHA1,
    TRAVIS_PULL_REQUEST_SHA,
    TRAVIS_COMMIT,
    GITHUB_EVENT_PATH,
    GITHUB_SHA,
    BUILD_SOURCEVERSION,
    SYSTEM_PULLREQUEST_SOURCEBRANCH,
  } = env;
  const sha =
    HAPPO_CURRENT_SHA ||
    CURRENT_SHA ||
    CIRCLE_SHA1 ||
    TRAVIS_PULL_REQUEST_SHA ||
    TRAVIS_COMMIT;
  if (sha) {
    return sha;
  }
  if (SYSTEM_PULLREQUEST_SOURCEBRANCH) {
    // azure pull request
    const rawBranchName = SYSTEM_PULLREQUEST_SOURCEBRANCH.split('/').toReversed()[0];
    const res = spawnSync('git', ['rev-parse', `origin/${rawBranchName}`], {
      encoding: 'utf8',
    });
    if (res.status === 0 && res.stdout) {
      const sha = res.stdout.split('\n')[0];
      if (sha) {
        return sha;
      }
    }
  }
  if (BUILD_SOURCEVERSION) {
    // azure master job
    return BUILD_SOURCEVERSION;
  }
  if (GITHUB_EVENT_PATH) {
    const ghEvent = await resolveGithubEvent(GITHUB_EVENT_PATH);
    if (ghEvent.pull_request) {
      return ghEvent.pull_request.head.sha;
    }
    if (ghEvent.merge_group) {
      return ghEvent.merge_group.head_sha;
    }
    return (
      ghEvent.after || GITHUB_SHA || `dev-${crypto.randomBytes(4).toString('hex')}`
    );
  }
  return `dev-${crypto.randomBytes(4).toString('hex')}`;
}

function resolveFallbackShas(
  env: Record<string, string | undefined>,
  beforeSha: string | undefined,
): Array<string> | undefined {
  const { HAPPO_FALLBACK_SHAS, HAPPO_FALLBACK_SHAS_COUNT = 50 } = env;

  if (HAPPO_FALLBACK_SHAS) {
    return HAPPO_FALLBACK_SHAS.split(/[,\n]/);
  }

  const res = spawnSync(
    'git',
    [
      'log',
      '--format=%H',
      '--first-parent',
      `--max-count=${HAPPO_FALLBACK_SHAS_COUNT}`,
      `${beforeSha}^`,
    ],
    {
      encoding: 'utf8',
    },
  );
  if (res.status !== 0) {
    return undefined;
  }
  return res.stdout.split('\n').filter(Boolean);
}

function getRawEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const res: Record<string, string | undefined> = {};
  for (const key of envKeys) {
    res[key] = env[key];
  }
  return res;
}

export default async function resolveEnvironment(
  env: Record<string, string | undefined> = process.env,
): Promise<EnvironmentResult> {
  const debugMode = !!env.HAPPO_DEBUG;
  const afterSha = await resolveAfterSha(env);
  const beforeSha = await resolveBeforeSha(env, afterSha);
  const result = {
    link: await resolveLink(env),
    message: afterSha.startsWith('dev-') ? undefined : await resolveMessage(env),
    beforeSha,
    afterSha,
    nonce: env.HAPPO_NONCE,
    debugMode,
    notify: env.HAPPO_NOTIFY,
    fallbackShas: resolveFallbackShas(env, beforeSha),
  };
  if (debugMode) {
    console.log('[HAPPO] Raw environment', getRawEnv(env));
    console.log('[HAPPO] Resolved environment', result);
  }
  return result;
}
