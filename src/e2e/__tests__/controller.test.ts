import assert from 'node:assert';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import * as tmpfs from '../../test-utils/tmpfs.ts';
import Controller from '../controller.ts';

const port = 3000;

const originalEnv = { ...process.env };

let server: http.Server;

const TEST_API_KEY = 'test-api-key';
const TEST_API_SECRET = 'test-api-secret';

before(async () => {
  process.env.HAPPO_E2E_PORT = port.toString();

  let requestId = 0;

  server = http.createServer((req, res) => {
    // Set proper headers
    res.setHeader('Content-Type', 'application/json');

    if (
      req.url?.startsWith('/api/snap-requests/assets/') &&
      req.url?.endsWith('/signed-url')
    ) {
      res.end(JSON.stringify({ path: '/path/to/asset', uploadedAt: '2021-01-01' }));
      return;
    }

    res.end(JSON.stringify({ requestId: requestId++ }));
  });

  server.listen(port);

  // Create a mock happo.js file
  const mockHappoConfigContents = `
  export default {
    integration: { type: 'playwright' },
    apiKey: '${TEST_API_KEY}',
    apiSecret: '${TEST_API_SECRET}',
    targets: {
      chrome: {
        execute: async () => ['request-id-1'],
      },
    },
    endpoint: 'http://localhost:${port}',
  };
  `;

  tmpfs.mock({
    'happo.config.js': mockHappoConfigContents,
  });
});

after(() => {
  server.close();

  process.env = { ...originalEnv };

  tmpfs.restore();
});

describe('Controller', () => {
  it('initializes with the correct happo config', async () => {
    const controller = new Controller();
    await controller.init();
    assert.strictEqual(controller.config?.apiKey, TEST_API_KEY);
    assert.strictEqual(controller.config?.apiSecret, TEST_API_SECRET);
    assert.strictEqual(controller.config?.integration.type, 'playwright');
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
