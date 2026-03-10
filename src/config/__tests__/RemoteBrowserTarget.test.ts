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
    let receivedCalls: Array<{
      fields: Record<string, Array<string> | undefined>;
      payload: Record<string, unknown>;
    }> = [];
    let config: ConfigWithDefaults;

    before(async () => {
      httpServer = http.createServer((req, res) => {
        const form = new multiparty.Form();
        form.parse(req, (err, fields, files) => {
          if (err) {
            receivedCalls.push({ fields: {}, payload: {} });
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

          receivedCalls.push({ fields, payload });

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
      receivedCalls = [];
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
      it('sends one request per computed chunk (200 snaps → 2 chunks)', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(receivedCalls.length, 2);
      });

      it('sends one request when estimatedSnapsCount is 0', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 0,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(receivedCalls.length, 1);
      });

      it('sends one request when estimatedSnapsCount is Infinity', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: Infinity,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(receivedCalls.length, 1);
      });

      it('caps the number of chunks at 20', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 100 * 25,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(receivedCalls.length, 20);
      });

      it('sets correct chunk metadata in each payload', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        for (const [i, call] of receivedCalls.entries()) {
          assert.deepStrictEqual(call.payload.chunk, { index: i, total: 2 });
        }
      });
    });

    describe('with staticPackage but no estimatedSnapsCount', () => {
      it('sends a single request with no chunk metadata', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          { staticPackage: 'https://example.com/pkg.zip', targetName: 'chrome' },
          config,
        );
        assert.strictEqual(receivedCalls.length, 1);
        assert.strictEqual(receivedCalls[0]?.payload.chunk, undefined);
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
        assert.strictEqual(receivedCalls.length, 1);
        assert.strictEqual(receivedCalls[0]?.payload.chunk, undefined);
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
        assert.strictEqual(receivedCalls.length, 3);
        for (const [i, call] of receivedCalls.entries()) {
          assert.deepStrictEqual(call.payload.chunk, { index: i, total: 3 });
        }
      });
    });

    describe('with snapPayloads and estimatedSnapsCount (no staticPackage)', () => {
      it('sends a single request (estimatedSnapsCount ignored for snapPayloads)', async () => {
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
        assert.strictEqual(receivedCalls.length, 1);
      });
    });
  });
});
