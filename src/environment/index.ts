import { spawnSync } from 'node:child_process';
import crypto, { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

interface GitHubEvent {
  pull_request?: {
    html_url: string;
    title: string;
    base: {
      sha: string;
    };
    head: {
      sha: string;
    };
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

interface CLIArgs {
  baseBranch?: string;
  currentSha?: string;
  previousSha?: string;
  message?: string;
  link?: string;
}

export interface EnvironmentResult {
  link: string | undefined;
  message: string | undefined;
  author: string | undefined;
  beforeSha: string;
  afterSha: string;
  nonce: string | undefined;
  debugMode: boolean;
  notify: string | undefined;
  fallbackShas: Array<string> | undefined;
}

const envKeys: ReadonlyArray<string> = [
  'CIRCLE_PROJECT_REPONAME',
  'CIRCLE_PROJECT_USERNAME',
  'CIRCLE_SHA1',
  'CI_PULL_REQUEST',
  'GITHUB_BASE',
  'HAPPO_DEBUG',
  'HAPPO_GITHUB_BASE',
  'HAPPO_FALLBACK_SHAS',
  'HAPPO_FALLBACK_SHAS_COUNT',
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
  cliArgs: CLIArgs,
  env: Record<string, string | undefined>,
): Promise<string | undefined> {
  if (cliArgs.link) {
    // Validate the link
    let parsed: URL;
    try {
      parsed = new URL(cliArgs.link);
    } catch (e) {
      throw new TypeError(
        `link must be a valid http/https URL. Invalid URL: '${cliArgs.link}'`,
        { cause: e },
      );
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new TypeError(
        `link must be a valid http/https URL. Invalid protocol: '${parsed.protocol}' (from '${cliArgs.link}')`,
      );
    }

    return cliArgs.link;
  }

  const {
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

async function resolveAuthorEmail(
  env: Record<string, string | undefined>,
): Promise<string | undefined> {
  const { GITHUB_EVENT_PATH, HAPPO_AUTHOR } = env;

  if (HAPPO_AUTHOR) {
    return HAPPO_AUTHOR;
  }

  if (GITHUB_EVENT_PATH) {
    // const ghEvent = await resolveGithubEvent(GITHUB_EVENT_PATH);
    // TODO: do something with the github event
  }

  const res = spawnSync('git', ['show', '-s', '--format=%ae'], {
    encoding: 'utf8',
  });

  if (res.status !== 0) {
    return undefined;
  }

  return res.stdout.trim();
}

async function resolveMessage(
  cliArgs: CLIArgs,
  env: Record<string, string | undefined>,
  afterSha: string,
): Promise<string | undefined> {
  if (cliArgs.message) {
    return cliArgs.message;
  }

  const { GITHUB_EVENT_PATH } = env;

  if (GITHUB_EVENT_PATH) {
    const ghEvent = await resolveGithubEvent(GITHUB_EVENT_PATH);
    if (ghEvent.pull_request) {
      return ghEvent.pull_request.title;
    }
  }

  const res = spawnSync('git', ['log', '-1', '--pretty=%s', afterSha], {
    encoding: 'utf8',
  });

  if (res.status !== 0) {
    return undefined;
  }

  const message = res.stdout.split('\n')[0];

  if (!message) {
    return undefined;
  }

  return message;
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
  cliArgs: CLIArgs,
  env: Record<string, string | undefined>,
  afterSha: string,
): Promise<string | undefined> {
  if (cliArgs.previousSha) {
    return cliArgs.previousSha;
  }

  const {
    HAPPO_BEFORE_SHA_TAG_MATCHER,
    TRAVIS_COMMIT_RANGE,
    GITHUB_EVENT_PATH,
    SYSTEM_PULLREQUEST_TARGETBRANCH,
  } = env;

  if (HAPPO_BEFORE_SHA_TAG_MATCHER) {
    const resolvedSha = resolveShaFromTagMatcher(HAPPO_BEFORE_SHA_TAG_MATCHER);
    if (resolvedSha) {
      return resolvedSha;
    }
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

  const baseBranch = cliArgs.baseBranch || baseAzureBranch || 'origin/main';
  const res = spawnSync('git', ['merge-base', baseBranch, afterSha], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    console.error(`[HAPPO] Ignored error when resolving base commit: ${res.stderr}`);
    return undefined;
  }
  return res.stdout.split('\n')[0];
}

function getHeadShaWithLocalChanges(): {
  headSha: string;
  headShaWithLocalChanges: string;
} {
  const randomSha = randomBytes(20).toString('hex');
  // Get the HEAD sha from the git repo, or if we have local changes, add them to the sha
  const res = spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    return { headSha: randomSha, headShaWithLocalChanges: randomSha };
  }
  const headSha = res.stdout.split('\n')[0];
  if (!headSha) {
    return { headSha: randomSha, headShaWithLocalChanges: randomSha };
  }

  // Check for local changes
  const diffRes = spawnSync('git', ['diff', 'HEAD'], {
    encoding: 'utf8',
  });

  // If git diff fails, return HEAD sha
  if (diffRes.status !== 0) {
    return { headSha, headShaWithLocalChanges: headSha };
  }

  const lsRes = spawnSync('git', ['ls-files', '--other', '--exclude-standard'], {
    encoding: 'utf8',
  });

  if (lsRes.status !== 0) {
    return { headSha, headShaWithLocalChanges: headSha };
  }

  const localChanges = [diffRes.stdout.trim(), lsRes.stdout.trim()];

  // Get contents of untracked files
  const untrackedFiles = lsRes.stdout
    .trim()
    .split('\n')
    .filter((file) => file.trim());

  for (const file of untrackedFiles) {
    try {
      const content = readFileSync(file, 'utf8');
      localChanges.push(content);
    } catch {
      // If we can't read the file, include just the filename
      localChanges.push(`${file}:<unreadable>`);
    }
  }

  const allChanges = localChanges.join('');

  if (!allChanges.trim()) {
    return { headSha, headShaWithLocalChanges: headSha };
  }

  // If there are local changes, create a hash that includes both HEAD and the changes
  const headShaWithLocalChanges = crypto
    .createHash('sha256')
    .update(headSha)
    .update(allChanges)
    .digest('hex')
    .slice(0, 40);

  return { headSha, headShaWithLocalChanges };
}

async function resolveAfterSha(
  cliArgs: CLIArgs,
  env: Record<string, string | undefined>,
): Promise<string | { headSha: string; headShaWithLocalChanges: string }> {
  if (cliArgs.currentSha) {
    return cliArgs.currentSha;
  }

  const {
    CIRCLE_SHA1,
    TRAVIS_PULL_REQUEST_SHA,
    TRAVIS_COMMIT,
    GITHUB_EVENT_PATH,
    GITHUB_SHA,
    BUILD_SOURCEVERSION,
    SYSTEM_PULLREQUEST_SOURCEBRANCH,
  } = env;

  const sha = CIRCLE_SHA1 || TRAVIS_PULL_REQUEST_SHA || TRAVIS_COMMIT;

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
    if (ghEvent.after) {
      return ghEvent.after;
    }
    if (GITHUB_SHA) {
      return GITHUB_SHA;
    }
  }
  return getHeadShaWithLocalChanges();
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
  cliArgs: CLIArgs,
  env: Record<string, string | undefined> = process.env,
): Promise<EnvironmentResult> {
  const debugMode = !!env.HAPPO_DEBUG;
  const afterSha = await resolveAfterSha(cliArgs, env);

  const realAfterSha = typeof afterSha === 'string' ? afterSha : afterSha.headSha;
  const afterShaWithLocalChanges =
    typeof afterSha === 'string' ? afterSha : afterSha.headShaWithLocalChanges;

  // Resolve the before SHA with the true HEAD SHA
  const [beforeSha, link, author, message] = await Promise.all([
    resolveBeforeSha(cliArgs, env, realAfterSha),
    resolveLink(cliArgs, env),
    resolveAuthorEmail(env),

    // Resolve message with the SHA that includes local changes
    resolveMessage(cliArgs, env, afterShaWithLocalChanges),
  ]);

  const nonNullBeforeSha = beforeSha || afterShaWithLocalChanges;

  const result = {
    link,
    author,
    message,
    beforeSha: nonNullBeforeSha,
    afterSha: afterShaWithLocalChanges,
    nonce: env.HAPPO_NONCE,
    debugMode,
    notify: env.HAPPO_NOTIFY,
    fallbackShas: resolveFallbackShas(env, nonNullBeforeSha),
  };

  if (debugMode) {
    console.log('[HAPPO] Raw environment', getRawEnv(env));
    console.log('[HAPPO] Resolved environment', result);
  }

  return result;
}
