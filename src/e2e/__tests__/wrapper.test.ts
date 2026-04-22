import assert from 'node:assert';
import http from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';

import runWithWrapper from '../wrapper.ts';

const BEFORE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const AFTER_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2';

let server: http.Server;
let serverPort: number;
let comparisonEndpointHits: number;

const happoConfig = () => ({
  apiKey: 'test-key',
  apiSecret: 'test-secret',
  targets: {},
  endpoint: `http://localhost:${serverPort}`,
  githubApiUrl: 'https://api.github.com',
  integration: { type: 'playwright' as const },
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

      if (req.url?.match(/^\/api\/jobs\//)) {
        res.end(JSON.stringify({ id: 1, url: `http://localhost:${serverPort}/job/1` }));
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
});

// A node one-liner that POSTs one snap request ID to the e2e server then exits.
const childCommand = [
  process.execPath,
  '-e',
  `
    const http = require('http');
    const req = http.request(
      { port: process.env.HAPPO_E2E_PORT, method: 'POST', path: '/' },
      (res) => { res.resume(); res.on('end', () => process.exit(0)); }
    );
    req.write('1\\n');
    req.end();
  `,
];

describe('runWithWrapper', () => {
  it('creates a comparison when beforeSha differs from afterSha', { timeout: 5000 }, async () => {
    await runWithWrapper(childCommand, happoConfig(), baseEnvironment, console, 'happo.config.js');
    assert.equal(comparisonEndpointHits, 1);
  });

  it('skips comparison when beforeSha equals afterSha (default branch build)', { timeout: 5000 }, async () => {
    const environment = { ...baseEnvironment, beforeSha: AFTER_SHA };
    await runWithWrapper(childCommand, happoConfig(), environment, console, 'happo.config.js');
    assert.equal(comparisonEndpointHits, 0);
  });
});
