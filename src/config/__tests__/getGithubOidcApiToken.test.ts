import assert from 'node:assert';
import http from 'node:http';
import { afterEach, describe, it, mock } from 'node:test';

import getGithubOidcApiToken, {
  isGithubOidcAvailable,
} from '../getGithubOidcApiToken.ts';

interface RecordedRequest {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
  body: string;
}

async function startServer(
  exchange: { status: number; body: unknown } = {
    status: 200,
    body: { key: 'abc123', secret: 'shhh', expiresAt: '2026-01-01T00:00:00Z' },
  },
): Promise<{
  port: number;
  requests: Array<RecordedRequest>;
  close: () => Promise<void>;
}> {
  const requests: Array<RecordedRequest> = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body,
      });
      if (req.method === 'GET' && req.url?.startsWith('/id-token')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ value: 'the-id-token' }));
      } else if (req.method === 'POST' && req.url === '/api/auth/github-oidc') {
        res.writeHead(exchange.status, { 'Content-Type': 'application/json' });
        res.end(
          typeof exchange.body === 'string'
            ? exchange.body
            : JSON.stringify(exchange.body),
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server port');
  }
  return {
    port: address.port,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const logger = { log: mock.fn(), error: mock.fn() };

afterEach(() => {
  logger.log.mock.resetCalls();
  logger.error.mock.resetCalls();
});

function envFor(port: number) {
  return {
    ACTIONS_ID_TOKEN_REQUEST_URL: `http://localhost:${port}/id-token?api-version=2.0`,
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner-token',
  };
}

describe('isGithubOidcAvailable', () => {
  it('needs both runner variables', () => {
    assert.strictEqual(isGithubOidcAvailable({}), false);
    assert.strictEqual(
      isGithubOidcAvailable({ ACTIONS_ID_TOKEN_REQUEST_URL: 'http://x' }),
      false,
    );
    assert.strictEqual(
      isGithubOidcAvailable({
        ACTIONS_ID_TOKEN_REQUEST_URL: 'http://x',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'y',
      }),
      true,
    );
  });
});

describe('getGithubOidcApiToken', () => {
  it('returns null outside a GitHub Actions job with id-token permission', async () => {
    assert.strictEqual(
      await getGithubOidcApiToken('http://localhost:1', undefined, logger, {}),
      null,
    );
  });

  it('exchanges the ID token for an API key', async () => {
    const { port, requests, close } = await startServer();
    try {
      const result = await getGithubOidcApiToken(
        `http://localhost:${port}`,
        'storybook',
        logger,
        envFor(port),
      );

      assert.deepStrictEqual(result, { key: 'abc123', secret: 'shhh' });

      const [idTokenRequest, exchangeRequest] = requests;
      assert.ok(idTokenRequest?.url);
      const idTokenUrl = new URL(idTokenRequest.url, 'http://localhost');
      assert.strictEqual(idTokenUrl.searchParams.get('api-version'), '2.0');
      assert.strictEqual(idTokenUrl.searchParams.get('audience'), 'happo');
      assert.strictEqual(idTokenRequest.authorization, 'Bearer runner-token');

      assert.deepStrictEqual(JSON.parse(exchangeRequest?.body ?? ''), {
        token: 'the-id-token',
        project: 'storybook',
      });
    } finally {
      await close();
    }
  });

  it('omits project when none is configured, and honors a custom audience', async () => {
    const { port, requests, close } = await startServer();
    try {
      await getGithubOidcApiToken(`http://localhost:${port}`, undefined, logger, {
        ...envFor(port),
        HAPPO_GITHUB_OIDC_AUDIENCE: 'https://happo.example.com',
      });

      const idTokenUrl = new URL(requests[0]?.url ?? '', 'http://localhost');
      assert.strictEqual(
        idTokenUrl.searchParams.get('audience'),
        'https://happo.example.com',
      );
      assert.deepStrictEqual(JSON.parse(requests[1]?.body ?? ''), {
        token: 'the-id-token',
      });
    } finally {
      await close();
    }
  });

  it('throws with the server message when the exchange is refused', async () => {
    const { port, close } = await startServer({
      status: 403,
      body: 'GitHub Actions authentication is not enabled',
    });
    try {
      await assert.rejects(
        getGithubOidcApiToken(
          `http://localhost:${port}`,
          undefined,
          logger,
          envFor(port),
        ),
        /403 - GitHub Actions authentication is not enabled/,
      );
    } finally {
      await close();
    }
  });
});
