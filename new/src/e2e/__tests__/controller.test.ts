import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import Controller from '../controller.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = 3000;

// Type definitions
interface MockHappoConfig {
  apiKey: string;
  apiSecret: string;
  project: string;
  endpoint: string;
  targets: {
    chrome: {
      execute: () => Promise<string[]>;
    };
  };
}

interface OriginalEnv {
  HAPPO_ENABLED: string | undefined;
  HAPPO_E2E_PORT: string | undefined;
}

let mockHappoConfig: MockHappoConfig;
const mockHappoConfigPath = path.join(__dirname, '..', '.happo.js');

const originalEnv: OriginalEnv = {
  HAPPO_ENABLED: process.env.HAPPO_ENABLED,
  HAPPO_E2E_PORT: process.env.HAPPO_E2E_PORT,
};

let server: http.Server;

before(() => {
  process.env.HAPPO_ENABLED = 'true';
  process.env.HAPPO_E2E_PORT = port.toString();

  server = http.createServer(
    (req: http.IncomingMessage, res: http.ServerResponse) => {
      // Set proper headers
      res.setHeader('Content-Type', 'application/json');

      if (req.url?.startsWith('/api/snap-requests/assets-data/')) {
        res.end(
          JSON.stringify({ path: '/path/to/asset', uploadedAt: '2021-01-01' }),
        );
        return;
      }

      res.end(JSON.stringify({}));
    },
  );
  server.listen(port);

  // Create a mock happo.js file
  const mockHappoConfigContents = `
  module.exports = {
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    project: 'test-project',
    endpoint: 'http://localhost:${port}',
    targets: {
      chrome: {
        execute: async () => ['request-id-1'],
      },
    },
  };
  `;
  fs.writeFileSync(mockHappoConfigPath, mockHappoConfigContents);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mockHappoConfig = require(mockHappoConfigPath);
});

after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key as keyof OriginalEnv] = value;
  }

  // Clean up the mock config
  fs.unlinkSync(mockHappoConfigPath);

  server.close();
});

describe('Controller', () => {
  it('initializes with the correct happo config', async () => {
    const controller = new Controller();
    await controller.init();
    assert.strictEqual(controller.config?.apiKey, mockHappoConfig.apiKey);
    assert.strictEqual(controller.config?.apiSecret, mockHappoConfig.apiSecret);
    assert.strictEqual(controller.config?.project, mockHappoConfig.project);
    assert.deepStrictEqual(controller.snapshotsList, []);
    assert.deepStrictEqual(controller.assetUrls, []);
    assert.deepStrictEqual(controller.cssBlocks, []);
  });

  it('registers snapshots', async () => {
    const controller = new Controller();
    await controller.init();

    // Register a test snapshot
    await controller.registerSnapshot({
      html: '<div>Test</div>',
      assetUrls: [{ url: 'http://example.com/asset.jpg' }],
      component: 'Button',
      variant: 'primary',
      cssBlocks: [],
    });

    assert.deepStrictEqual(controller.snapshotsList, [
      {
        bodyElementAttrs: undefined,
        component: 'Button',
        html: '<div>Test</div>',
        htmlElementAttrs: undefined,
        stylesheets: [],
        targets: ['chrome'],
        timestamp: undefined,
        variant: 'primary',
      },
    ]);
    assert.deepStrictEqual(controller.assetUrls, [
      { url: 'http://example.com/asset.jpg' },
    ]);
    assert.deepStrictEqual(controller.cssBlocks, []);

    await controller.finish();
  });

  it('deduplicates snapshots', async () => {
    const controller = new Controller();
    await controller.init();

    await controller.registerSnapshot({
      html: '<div>Test</div>',
      component: 'Button',
      variant: 'primary',
      cssBlocks: [],
      assetUrls: [],
    });

    // This is a different snapshot than the first one:
    await controller.registerSnapshot({
      html: '<div>Unrelated</div>',
      component: 'Foo',
      variant: 'bar',
      cssBlocks: [],
      assetUrls: [],
    });

    // This is a copy of the first snapshot:
    await controller.registerSnapshot({
      html: '<div>Test</div>',
      component: 'Button',
      variant: 'primary',
      cssBlocks: [],
      assetUrls: [],
    });

    await controller.finish();

    assert.equal(controller.snapshotsList.length, 2);

    assert.deepStrictEqual(controller.snapshotsList, [
      {
        bodyElementAttrs: undefined,
        component: 'Button',
        html: '<div>Test</div>',
        htmlElementAttrs: undefined,
        stylesheets: [],
        targets: ['chrome'],
        timestamp: undefined,
        variant: 'primary',
      },
      {
        bodyElementAttrs: undefined,
        component: 'Foo',
        html: '<div>Unrelated</div>',
        htmlElementAttrs: undefined,
        stylesheets: [],
        targets: ['chrome'],
        timestamp: undefined,
        variant: 'bar',
      },
    ]);
  });

  // https://github.com/happo/happo-e2e/issues/58
  it('gracefully handles CSS files that cannot be downloaded when there are external assets', async () => {
    const controller = new Controller();
    await controller.init();

    // Register a test snapshot
    await controller.registerSnapshot({
      html: '<div>Test</div>',
      assetUrls: [
        {
          url: 'http://example.com/asset.jpg',
          name: '/_external/b5d64099e230f05fdcdd447bf8db95b3',
        },
      ],
      component: 'Button',
      variant: 'primary',
      cssBlocks: [
        {
          key: 'http://example.com/sheet.css',
          href: 'http://example.com/sheet.css',
        },
      ],
    });

    assert.deepStrictEqual(controller.snapshotsList, [
      {
        bodyElementAttrs: undefined,
        component: 'Button',
        html: '<div>Test</div>',
        htmlElementAttrs: undefined,
        stylesheets: ['http://example.com/sheet.css'],
        targets: ['chrome'],
        timestamp: undefined,
        variant: 'primary',
      },
    ]);
    assert.deepStrictEqual(controller.assetUrls, [
      {
        url: 'http://example.com/asset.jpg',
        name: '/_external/b5d64099e230f05fdcdd447bf8db95b3',
      },
    ]);
    assert.deepStrictEqual(controller.cssBlocks, [
      { key: 'http://example.com/sheet.css', href: 'http://example.com/sheet.css' },
    ]);

    await controller.finish();
  });
});
