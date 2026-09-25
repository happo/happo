import type { Logger } from '../isomorphic/types.ts';
import fetchWithRetry from '../network/fetchWithRetry.ts';

/**
 * The audience we ask GitHub to mint the ID token for. happo.io accepts
 * `happo`; an on-premise deployment that configured a different
 * `GITHUB_OIDC_AUDIENCE` can be matched with `HAPPO_GITHUB_OIDC_AUDIENCE`.
 */
export const DEFAULT_GITHUB_OIDC_AUDIENCE = 'happo';

type Env = Record<string, string | undefined>;

/**
 * Whether this is a GitHub Actions job that may request an OIDC ID token. The
 * runner only sets these variables when the job (or workflow) has
 * `permissions: id-token: write`, and never for pull requests from forks.
 */
export function isGithubOidcAvailable(env: Env = process.env): boolean {
  return !!env.ACTIONS_ID_TOKEN_REQUEST_URL && !!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
}

function assertIsIdTokenResponse(
  response: unknown,
): asserts response is { value: string } {
  if (
    typeof response !== 'object' ||
    response === null ||
    !('value' in response) ||
    typeof response.value !== 'string'
  ) {
    throw new TypeError('Unexpected GitHub Actions ID token response');
  }
}

function assertIsExchangeResponse(
  response: unknown,
): asserts response is { key: string; secret: string } {
  if (
    typeof response !== 'object' ||
    response === null ||
    !('key' in response) ||
    !('secret' in response) ||
    typeof response.key !== 'string' ||
    typeof response.secret !== 'string'
  ) {
    throw new TypeError('Unexpected GitHub OIDC token exchange response');
  }
}

async function requestIdToken(env: Env, logger: Logger): Promise<string> {
  // The runner-provided URL already carries query parameters of its own.
  const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL!);
  url.searchParams.set(
    'audience',
    env.HAPPO_GITHUB_OIDC_AUDIENCE || DEFAULT_GITHUB_OIDC_AUDIENCE,
  );
  const res = await fetchWithRetry(
    url,
    {
      headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
      retryCount: 3,
    },
    logger,
  );
  const json = await res.json();
  assertIsIdTokenResponse(json);
  return json.value;
}

/**
 * Authenticates a GitHub Actions job without a stored secret: asks the runner
 * for an OIDC ID token proving which repository the workflow runs in, and
 * trades it with Happo for a short-lived API key scoped to `project`. The
 * repository must be connected to the Happo account through the Happo GitHub
 * app.
 *
 * Returns null when no ID token can be requested here. Throws when one can but
 * the exchange fails, so the caller can report why.
 */
export default async function getGithubOidcApiToken(
  endpoint: string,
  project: string | undefined,
  logger: Logger,
  env: Env = process.env,
): Promise<{ key: string; secret: string } | null> {
  if (!isGithubOidcAvailable(env)) {
    return null;
  }

  const token = await requestIdToken(env, logger);

  const res = await fetchWithRetry(
    new URL('/api/auth/github-oidc', endpoint),
    {
      method: 'POST',
      body: { token, ...(project ? { project } : {}) },
      retryCount: 3,
    },
    logger,
  );
  const json = await res.json();
  assertIsExchangeResponse(json);
  return { key: json.key, secret: json.secret };
}
