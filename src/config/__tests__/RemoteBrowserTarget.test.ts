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
    let lastReceivedFields: Record<string, Array<string> | undefined>;
    let lastReceivedPayload: Record<string, unknown>;
    let config: ConfigWithDefaults;

    before(async () => {
      httpServer = http.createServer((req, res) => {
        const form = new multiparty.Form();
        form.parse(req, (err, fields, files) => {
          if (err) {
            // If parsing fails, return a 400 response instead of 200
            lastReceivedFields = {};
            lastReceivedPayload = {};
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
            return;
          }

          lastReceivedFields = fields;

          // Parse the uploaded payload JSON for inspection
          const payloadPath = files?.payload?.[0]?.path;
          if (payloadPath) {
            try {
              lastReceivedPayload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
            } catch {
              lastReceivedPayload = {};
            }
          }

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
      lastReceivedFields = {};
      lastReceivedPayload = {};
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
      it('sends estimatedSnapsCount as a top-level form field', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        assert.deepStrictEqual(lastReceivedFields.estimatedSnapsCount, ['200']);
      });

      it('does not include estimatedSnapsCount in the payload JSON', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          {
            staticPackage: 'https://example.com/pkg.zip',
            estimatedSnapsCount: 200,
            targetName: 'chrome',
          },
          config,
        );
        assert.strictEqual(lastReceivedPayload.estimatedSnapsCount, undefined);
      });
    });

    describe('with staticPackage but no estimatedSnapsCount', () => {
      it('does not send estimatedSnapsCount', async () => {
        const target = new RemoteBrowserTarget('chrome', baseTarget);
        await target.execute(
          { staticPackage: 'https://example.com/pkg.zip', targetName: 'chrome' },
          config,
        );
        assert.strictEqual(lastReceivedFields.estimatedSnapsCount, undefined);
      });
    });

    describe('with snapPayloads and estimatedSnapsCount (no staticPackage)', () => {
      it('does not send estimatedSnapsCount', async () => {
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
        assert.strictEqual(lastReceivedFields.estimatedSnapsCount, undefined);
      });
    });
  });
});
