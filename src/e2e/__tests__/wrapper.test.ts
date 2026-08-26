import assert from 'node:assert';
import http from 'node:http';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import runWithWrapper from '../wrapper.ts';

const BEFORE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const AFTER_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2';

let server: http.Server;
let serverPort: number;
let comparisonEndpointHits: number;
let requests: Array<{ url: string; body: unknown }>;
let baselineSha: string | null;

const happoConfig = () => ({
  apiKey: 'test-key',
  apiSecret: 'test-secret',
  targets: {},
  endpoint: `http://localhost:${serverPort}`,
  githubApiUrl: 'https://api.github.com',
  integration: { type: 'playwright' as const },
  failOnWaitForTimeout: true,
});

const baseEnvironment = {
  beforeSha: BEFORE_SHA,
  afterSha: AFTER_SHA,
  link: undefined,
  message: undefined,
  authorEmail: undefined,
  nonce: undefined,
  debugMode: false,
  notify: undefined,
  fallbackShas: undefined,
  githubToken: undefined,
  ci: false,
  ciJobUrl: undefined,
  skip: undefined,
  only: undefined,
};

before(async () => {
  await new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      // Connection: close prevents undici from pooling connections, which
      // would otherwise keep the event loop alive and hang the test process.
      res.setHeader('Connection', 'close');
      res.setHeader('Content-Type', 'application/json');

      const chunks: Array<Buffer> = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let body: unknown;
        try {
          body = raw ? JSON.parse(raw) : undefined;
        } catch {
          body = raw;
        }
        requests.push({ url: req.url ?? '', body });
      });

      if (req.url?.match(/\/find-baseline$/)) {
        if (!baselineSha) {
          // The real API 404s when there is no baseline report.
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'No baseline report found' }));
          return;
        }
        res.end(JSON.stringify({ sha: baselineSha }));
        return;
      }

      if (req.url?.match(/^\/api\/snap-requests\/extends-report/)) {
        res.end(JSON.stringify({ requestId: 4242 }));
        return;
      }

      if (req.url?.match(/^\/api\/jobs\//)) {
        res.end(
          JSON.stringify({ id: 1, url: `http://localhost:${serverPort}/job/1` }),
        );
        return;
      }

      if (req.url?.match(/^\/api\/async-reports\//)) {
        res.end(JSON.stringify({ id: 1 }));
        return;
      }

      if (req.url?.match(/^\/api\/reports\/.*\/compare\//)) {
        comparisonEndpointHits++;
        res.end(
          JSON.stringify({
            id: 1,
            statusImageUrl: 'http://example.com/status.png',
            compareUrl: 'http://example.com/compare',
          }),
        );
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });

    server.listen(0, () => {
      serverPort = (server.address() as { port: number }).port;
      resolve();
    });
  });
});

after(() => {
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  comparisonEndpointHits = 0;
  requests = [];
  baselineSha = 'baseline-sha';
});

// Script that POSTs one snap request ID to the e2e server then exits.
// Using a fixture file avoids cmd.exe quoting issues on Windows.
const childCommand = [
  process.execPath,
  path.join(import.meta.dirname, 'fixtures', 'post-snap-request.cjs'),
];

describe('runWithWrapper', () => {
  it(
    'creates a comparison when beforeSha differs from afterSha',
    { timeout: 5000 },
    async () => {
      await runWithWrapper(
        childCommand,
        happoConfig(),
        baseEnvironment,
        console,
        'happo.config.js',
      );
      assert.equal(comparisonEndpointHits, 1);
    },
  );

  it(
    'skips comparison when beforeSha equals afterSha (default branch build)',
    { timeout: 5000 },
    async () => {
      const environment = { ...baseEnvironment, beforeSha: AFTER_SHA };
      await runWithWrapper(
        childCommand,
        happoConfig(),
        environment,
        console,
        'happo.config.js',
      );
      assert.equal(comparisonEndpointHits, 0);
    },
  );

  it(
    'borrows skipped examples from the baseline via an extends-report',
    { timeout: 5000 },
    async () => {
      const skip = [{ component: 'Button', variant: 'Primary' }];
      await runWithWrapper(
        childCommand,
        happoConfig(),
        baseEnvironment,
        console,
        'happo.config.js',
        JSON.stringify(skip),
      );

      const extendsRequest = requests.find((r) =>
        r.url.includes('/snap-requests/extends-report'),
      );
      assert.ok(extendsRequest, 'expected an extends-report request');
      assert.deepStrictEqual(
        (extendsRequest.body as { extendedSnaps: unknown }).extendedSnaps,
        skip,
      );
      assert.strictEqual(
        (extendsRequest.body as { extendsSha: string }).extendsSha,
        'baseline-sha',
      );

      // Without a nonce the async report is finalized by this POST, so the
      // extends-report id has to be included in it.
      const reportRequest = requests.find(
        (r) => r.url === `/api/async-reports/${AFTER_SHA}`,
      );
      assert.ok(reportRequest, 'expected an async report request');
      assert.ok(
        (reportRequest.body as { requestIds: Array<number> }).requestIds.includes(
          4242,
        ),
        'expected the extends-report id in the async report',
      );
    },
  );

  it(
    'does not create an extends-report when there is no skip list',
    { timeout: 5000 },
    async () => {
      await runWithWrapper(
        childCommand,
        happoConfig(),
        baseEnvironment,
        console,
        'happo.config.js',
      );

      assert.strictEqual(
        requests.find((r) => r.url.includes('/extends-report')),
        undefined,
      );
    },
  );

  it(
    'still posts the report when no baseline is found',
    { timeout: 5000 },
    async () => {
      baselineSha = null;
      await runWithWrapper(
        childCommand,
        happoConfig(),
        baseEnvironment,
        console,
        'happo.config.js',
        JSON.stringify([{ component: 'Button', variant: 'Primary' }]),
      );

      assert.strictEqual(
        requests.find((r) => r.url.includes('/extends-report')),
        undefined,
      );
      assert.ok(
        requests.find((r) => r.url === `/api/async-reports/${AFTER_SHA}`),
        'expected an async report request anyway',
      );
    },
  );

  it(
    'does not borrow when a nonce is set (the finalize call does it instead)',
    { timeout: 5000 },
    async () => {
      const environment = { ...baseEnvironment, nonce: 'test-nonce' };
      await runWithWrapper(
        childCommand,
        happoConfig(),
        environment,
        console,
        'happo.config.js',
        JSON.stringify([{ component: 'Button', variant: 'Primary' }]),
      );

      assert.strictEqual(
        requests.find((r) => r.url.includes('/extends-report')),
        undefined,
      );
    },
  );
});
