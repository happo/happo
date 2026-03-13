import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';

import multiparty from 'multiparty';

import type {
  BrowserType,
  ConfigWithDefaults,
  TargetWithDefaults,
} from '../index.ts';
import RemoteBrowserTarget from '../RemoteBrowserTarget.ts';

const baseTarget: TargetWithDefaults = {
  type: 'chrome',
  viewport: '1024x768',
  __dynamic: false,
};

describe('RemoteBrowserTarget', () => {
  describe('constructor', () => {
    it('throws when browserName is undefined', () => {
      assert.throws(
        () =>
          new RemoteBrowserTarget(undefined as unknown as BrowserType, baseTarget),
        /Invalid browser type/,
      );
    });

    it('does not throw for a valid browser type', () => {
      assert.doesNotThrow(() => new RemoteBrowserTarget('chrome', baseTarget));
    });
  });

  describe('execute()', () => {
    let httpServer: http.Server;
    /**
     * Calls to /api/snap-requests/bulk. Each entry is the parsed JSON body.
     */
    let bulkCalls: Array<{ items: Array<Record<string, unknown>> }> = [];
    /**
     * Calls to /api/snap-requests (individual, multipart fallback).
     */
    let individualCalls: Array<{
      fields: Record<string, Array<string> | undefined>;
      payload: Record<string, unknown>;
    }> = [];
    /**
     * When true the server returns 404 for bulk requests, triggering the
     * individual-request fallback path.
     */
    let simulateBulkNotSupported = false;
    /**
     * When true the server returns an error for the first item in a bulk
     * request, triggering per-item individual retry.
     */
    let simulateBulkPartialFailure = false;
    /**
     * When true the server returns a 200 bulk response with an invalid shape
     * (no "results" array), exercising the "malformed bulk response" fallback
     * path which should fall back to individual requests.
     */
    let simulateBulkInvalidShape = false;
    let config: ConfigWithDefaults;

    before(async () => {
      httpServer = http.createServer((req, res) => {
        if (req.url?.startsWith('/api/snap-requests/bulk')) {
          if (simulateBulkNotSupported) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body) as {
                items: Array<Record<string, unknown>>;
              };
              bulkCalls.push(parsed);

              if (simulateBulkInvalidShape) {
                // 200 OK but without a valid "results" array – simulates a
                // non-conforming bulk response from an older/custom server.
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
              }

              const results = parsed.items.map((_, idx) =>
                simulateBulkPartialFailure && idx === 0
                  ? { error: 'simulated failure' }
                  : { requestId: idx + 1 },
              );
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ results }));
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'bad json' }));
            }
          });
          return;
        }

        // Individual multipart fallback
        const form = new multiparty.Form();
        form.parse(req, (err, fields, files) => {
          if (err) {
            individualCalls.push({ fields: {}, payload: {} });
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
            return;
          }

          let payload: Record<string, unknown> = {};
          const payloadPath = files?.payload?.[0]?.path;
          if (payloadPath) {
            try {
              payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
            } catch {
              // ignore
            }
          }

          individualCalls.push({ fields, payload });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ requestId: 1 }));
        });
      });

      await new Promise<void>((resolve) => {
        httpServer.listen(0, resolve);
      });
    });

    after(async () => {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    });

    beforeEach(() => {
      bulkCalls = [];
      individualCalls = [];
      simulateBulkNotSupported = false;
      simulateBulkPartialFailure = false;
      simulateBulkInvalidShape = false;
      const address = httpServer.address() as { port: number };
      config = {
        githubApiUrl: 'https://api.github.com',
        targets: {},
        project: 'test',
        integration: {
          type: 'custom',
          build: async () => ({ rootDir: './custom', entryPoint: 'index.js' }),
        },
        endpoint: `http://localhost:${address.port}`,
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      };
    });

    describe('with staticPackage and estimatedSnapsCount', () => {
      it('sends a single bulk request with the correct number of items (200 snaps → 2 chunks)', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(bulkCalls.length, 1);
        assert.strictEqual(bulkCalls[0]?.items.length, 2);
      });

      it('sends a single bulk request with one item when estimatedSnapsCount is 0', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 0,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(bulkCalls.length, 1);
        assert.strictEqual(bulkCalls[0]?.items.length, 1);
      });

      it('sends a single bulk request with one item when estimatedSnapsCount is Infinity', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: Infinity,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(bulkCalls.length, 1);
        assert.strictEqual(bulkCalls[0]?.items.length, 1);
      });

      it('caps the number of items at 20', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 100 * 25,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(bulkCalls.length, 1);
        assert.strictEqual(bulkCalls[0]?.items.length, 20);
      });

      it('sets correct chunk metadata in each item payload', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        const items = bulkCalls[0]?.items ?? [];
        for (const [i, item] of items.entries()) {
          const payload = JSON.parse(item.payloadString as string) as {
            chunk: { index: number; total: number };
          };
          assert.deepStrictEqual(payload.chunk, { index: i, total: 2 });
        }
      });
    });

    describe('with staticPackage but no estimatedSnapsCount', () => {
      it('sends a single bulk request with one item and no chunk metadata', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          { staticPackage: 'https://example.com/pkg.zip', targetName: 'chrome' },
          config,
        );
        assert.strictEqual(bulkCalls.length, 1);
        assert.strictEqual(bulkCalls[0]?.items.length, 1);
        const payload = JSON.parse(
          bulkCalls[0]?.items[0]?.payloadString as string,
        ) as { chunk?: unknown };
        assert.strictEqual(payload.chunk, undefined);
      });
    });

    describe('with staticPackage, estimatedSnapsCount, and explicit chunks set', () => {
      it('uses explicit chunks and ignores estimatedSnapsCount (chunks: 1)', async () => {
        const target = new RemoteBrowserTarget('chrome', {
          ...baseTarget,
          chunks: 1,
        });
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(bulkCalls.length, 1);
        assert.strictEqual(bulkCalls[0]?.items.length, 1);
        const payload = JSON.parse(
          bulkCalls[0]?.items[0]?.payloadString as string,
        ) as { chunk?: unknown };
        assert.strictEqual(payload.chunk, undefined);
      });

      it('uses explicit chunks and ignores estimatedSnapsCount (chunks: 3)', async () => {
        const target = new RemoteBrowserTarget('chrome', {
          ...baseTarget,
          chunks: 3,
        });
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(bulkCalls.length, 1);
        assert.strictEqual(bulkCalls[0]?.items.length, 3);
        for (const [i, item] of (bulkCalls[0]?.items ?? []).entries()) {
          const payload = JSON.parse(item.payloadString as string) as {
            chunk: { index: number; total: number };
          };
          assert.deepStrictEqual(payload.chunk, { index: i, total: 3 });
        }
      });
    });

    describe('with snapPayloads and estimatedSnapsCount (no staticPackage)', () => {
      it('sends a single bulk request with one item (estimatedSnapsCount ignored for snapPayloads)', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            snapPayloads: [
              { component: 'Foo', variant: 'default', html: '<b>hi</b>' },
            ],
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(bulkCalls.length, 1);
        assert.strictEqual(bulkCalls[0]?.items.length, 1);
      });
    });

    describe('per-item retry when bulk endpoint returns partial failures', () => {
      beforeEach(() => {
        simulateBulkPartialFailure = true;
      });

      it('retries the failed item individually (2 chunks → 1 bulk + 1 individual)', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(bulkCalls.length, 1);
        assert.strictEqual(individualCalls.length, 1);
      });

      it('returns the correct requestIds after per-item retry', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        const requestIds = await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        // Item 0 failed in bulk and was retried individually (individual endpoint returns requestId: 1).
        // Item 1 succeeded in bulk with requestId: 2.
        assert.deepStrictEqual(requestIds, [1, 2]);
      });
    });

    describe('fallback to individual requests when bulk endpoint returns 404', () => {
      beforeEach(() => {
        simulateBulkNotSupported = true;
      });

      it('falls back and sends one individual request per chunk (200 snaps → 2 chunks)', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(bulkCalls.length, 0);
        assert.strictEqual(individualCalls.length, 2);
      });

      it('sets correct chunk metadata in each individual request payload', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        for (const [i, call] of individualCalls.entries()) {
          assert.deepStrictEqual(call.payload.chunk, { index: i, total: 2 });
        }
      });
    });

    describe('when bulk endpoint responds with invalid shape', () => {
      beforeEach(() => {
        simulateBulkInvalidShape = true;
      });

      it('throws an explicit error when bulk response is missing results', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await assert.rejects(
          () =>
            target.execute(
              {
                staticPackage: 'https://example.com/pkg.zip',
                estimatedSnapsCount: 200,
                targetName: 'chrome',
              },
              config,
            ),
          /Bulk snap-requests endpoint returned an unexpected payload shape/,
        );

        // We still made one bulk call, but since the response was malformed
        // RemoteBrowserTarget should NOT attempt any individual fallbacks.
        assert.strictEqual(bulkCalls.length, 1);
        assert.strictEqual(individualCalls.length, 0);
      });
    });
  });
});
