import Logger from '../utils/Logger.ts';

const REPO_URL_MATCHER = /https?:\/\/[^/]+\/([^/]+)\/([^/]+)\/pull\/([0-9]+)/;
// https://github.com/lightstep/lightstep/pull/6555

const { VERBOSE } = process.env;

const HAPPO_COMMENT_MARKER = '<!-- happo-comment -->';

const HAPPO_USER_AGENT = 'Happo client';

async function deleteExistingComments(
  normalizedGithubApiUrl: string,
  owner: string,
  repo: string,
  prNumber: number,
  authHeader: string,
) {
  const commentsRes = await fetch(
    `${normalizedGithubApiUrl}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      headers: {
        'User-Agent': HAPPO_USER_AGENT,
        Authorization: authHeader,
      },
      method: 'GET',
    },
  );

  if (!commentsRes.ok) {
    throw new Error(
      `Failed to fetch existing comments: ${commentsRes.status} ${await commentsRes.text()}`,
    );
  }

  const comments = await commentsRes.json();
  if (!Array.isArray(comments)) {
    throw new TypeError('Comments is not an array');
  }
  const happoComments = comments.filter((comment: unknown) => {
    if (typeof comment !== 'object' || comment === null) {
      return false;
    }
    if (!('body' in comment)) {
      return false;
    }
    if (typeof comment.body !== 'string') {
      return false;
    }
    return comment.body.startsWith(HAPPO_COMMENT_MARKER);
  });

  if (VERBOSE) {
    console.log(
      `Found ${happoComments.length} happo comments to delete out of a total of ${comments.length} comments on the PR.`,
    );
  }

  await Promise.all(
    happoComments.map(async (comment) => {
      const res = await fetch(
        `${normalizedGithubApiUrl}/repos/${owner}/${repo}/issues/comments/${comment.id}`,
        {
          method: 'DELETE',
          headers: {
            'User-Agent': HAPPO_USER_AGENT,
            Authorization: authHeader,
          },
        },
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      return res;
    }),
  );
}

interface PostGitHubCommentOptions {
  githubApiUrl: string;
  statusImageUrl: string;
  compareUrl: string;
  link: string;
  authToken?: string | undefined;
}

export default async function postGitHubComment({
  githubApiUrl,
  statusImageUrl,
  compareUrl,
  link,
  authToken,
}: PostGitHubCommentOptions): Promise<boolean> {
  const matches = link.match(REPO_URL_MATCHER);
  if (!matches) {
    new Logger().info(
      `URL does not look like a github PR URL: ${link}. Skipping github comment posting...`,
    );
    return false;
  }

  const owner = matches[1];
  const repo = matches[2];
  const prNumber = Number.parseInt(matches[3] || '', 10);

  if (!owner) {
    throw new Error('Missing owner');
  }
  if (!repo) {
    throw new Error('Missing repo');
  }
  if (Number.isNaN(prNumber)) {
    throw new TypeError('PR number is not a number');
  }

  const normalizedGithubApiUrl = githubApiUrl.replace(/\/$/, '');

  const authHeader = `Bearer ${authToken}`;

  if (VERBOSE) {
    console.log('Deleting existing happo comments...');
  }
  await deleteExistingComments(
    normalizedGithubApiUrl,
    owner,
    repo,
    prNumber,
    authHeader,
  );

  const body = `${HAPPO_COMMENT_MARKER}\n[![Happo status](${statusImageUrl})](${compareUrl})`;
  const res = await fetch(
    `${normalizedGithubApiUrl}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: 'POST',
      headers: {
        'User-Agent': HAPPO_USER_AGENT,
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `Failed to post github comment: ${res.status} ${await res.text()}`,
    );
  }

  if (VERBOSE) {
    console.log('Posted github comment successfully. Response is', await res.json());
  }

  return true;
}
