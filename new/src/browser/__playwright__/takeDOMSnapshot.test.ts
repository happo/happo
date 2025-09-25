import http from 'node:http';

import { expect, type Page, test } from '@playwright/test';
import handler from 'serve-handler';

import type { DOMSnapshotResult } from '../takeDOMSnapshot.ts';

declare global {
  var happoTakeDOMSnapshot: typeof import('../takeDOMSnapshot.ts').default;
}

let server: http.Server;

async function setupPage(page: Page): Promise<void> {
  await page.on('console', (msg) => {
    console.log(`Browser console [${msg.type()}]:`, msg.text());
  });
  await page.addInitScript({
    path: './dist/browser/main.bundle.js',
  });
}

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    return handler(req, res, {
      public: './src/browser/__playwright__/test-assets',
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(7700, () => resolve());
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

test('regular elements', async ({ page }) => {
  await setupPage(page);

  await page.goto('/regular-elements');

  const snapshot = await page.evaluate((): DOMSnapshotResult => {
    return globalThis.happoTakeDOMSnapshot({
      doc: document,
      element: document.body,
    });
  });

  expect(snapshot.html).toMatch(/<h1>Hello<\/h1>/s);
  expect(snapshot.html).toMatch(/<p>world<\/p>/s);
  expect(snapshot.html).toMatch(/<img src=".*" alt="happo-logo">/s);
  expect(snapshot.assetUrls).toEqual([
    {
      url: '/regular-elements/happo-logo.png',
      baseUrl: 'http://localhost:7700/regular-elements',
    },
  ]);

  expect(snapshot.cssBlocks).toEqual([]);
});

test('style collection', async ({ page }) => {
  await setupPage(page);

  await page.goto('/style-collection');

  const snapshot = await page.evaluate((): DOMSnapshotResult => {
    return globalThis.window.happoTakeDOMSnapshot({
      doc: document,
      element: document.body,
    });
  });

  expect(snapshot.cssBlocks.length).toBe(2);
  expect(snapshot.cssBlocks[0]?.content).toMatch(/--my-custom-font: 400 1rem/);
  expect(snapshot.cssBlocks[0]?.content).toMatch(/--my-custom-font-weight: 400;/);
  expect(snapshot.cssBlocks[0]?.content).toMatch(/font: var\(--my-custom-font\)/);
  expect(snapshot.cssBlocks[0]?.content).toMatch(
    /font-weight: var\(--my-custom-font-weight\);/,
  );

  expect(snapshot.cssBlocks[1]?.content).toMatch(/color: yellow;/);
});

test('one custom element', async ({ page }) => {
  await setupPage(page);

  await page.goto('/one-custom-element');

  const snapshot = await page.evaluate((): DOMSnapshotResult => {
    return globalThis.happoTakeDOMSnapshot({
      doc: document,
      element: document.body,
    });
  });

  expect(snapshot.html).toMatch(/<h1>Hello<\/h1>/s);
  expect(snapshot.html).toMatch(/<my-element data-color="red">/s);
  expect(snapshot.html).toMatch(
    /<happo-shadow-content style="display: none;"><style>/s,
  );
  expect(snapshot.assetUrls).toEqual([]);
  expect(snapshot.cssBlocks).toEqual([]);
});

test('nested custom elements', async ({ page }) => {
  await setupPage(page);

  await page.goto('/nested-custom-elements');

  const layoutContainer = await page.$('layout-container');
  const htmlBefore = await layoutContainer?.evaluate((el) => el.outerHTML);

  const snapshot = await page.evaluate((): DOMSnapshotResult => {
    return globalThis.happoTakeDOMSnapshot({
      doc: document,
      element: document.body,
    });
  });

  const htmlAfter = await layoutContainer?.evaluate((el) => el.outerHTML);

  // The happo-shadow-content elements should not be present in the DOM after the snapshot is taken
  expect(htmlAfter).toEqual(htmlBefore);

  expect(snapshot.html).toMatch(/<layout-container data-columns="4">/s);
  expect(snapshot.html).toMatch(
    /<component-card data-title="First card" role="article">/s,
  );
  expect(snapshot.html).toMatch(
    /<component-card data-title="Second card" role="article">/s,
  );
  expect(snapshot.html).toMatch(
    /<component-card data-title="Third card" role="article">/s,
  );
  expect(snapshot.html).toMatch(
    /<component-card data-title="Fourth card" role="article">/s,
  );

  expect((snapshot.html.match(/<happo-shadow-content/gs) || []).length).toBe(5);

  expect(snapshot.assetUrls).toEqual([
    {
      url: '/nested-custom-elements/avatar.jpeg',
      baseUrl: 'http://localhost:7700/nested-custom-elements',
    },
    {
      url: '/nested-custom-elements/avatar.jpeg',
      baseUrl: 'http://localhost:7700/nested-custom-elements',
    },
    {
      url: '/nested-custom-elements/avatar.jpeg',
      baseUrl: 'http://localhost:7700/nested-custom-elements',
    },
    {
      url: '/nested-custom-elements/avatar.jpeg',
      baseUrl: 'http://localhost:7700/nested-custom-elements',
    },
  ]);
  expect(snapshot.cssBlocks).toEqual([]);
});

test('custom element with special stylesheets', async ({ page }) => {
  await setupPage(page);

  await page.goto('/custom-element-with-special-stylesheets');

  const snapshot = await page.evaluate((): DOMSnapshotResult => {
    return globalThis.happoTakeDOMSnapshot({
      doc: document,
      element: document.body,
    });
  });

  expect(snapshot.html).toMatch(/<h1>Hello world<\/h1>/s);
  expect(snapshot.html).toMatch(/<my-element>/s);
  expect(snapshot.html).toMatch(/<happo-shadow-content style="display: none;">/s);

  expect(snapshot.html).toMatch(/<style data-happo-inlined="true">/s);
  expect(snapshot.html).toMatch(/h1.*\{.*font-size:.*88px;.*\}/s);
  expect(snapshot.html).not.toMatch(/:host \{/s);

  // The cssBlocks property collects global stylesheets. Our <link> element
  // is inside a shadow root, so it should not be included in the cssBlocks.
  expect(snapshot.cssBlocks).toEqual([]);

  // Instead, it should be included in the assetUrls.
  expect(snapshot.assetUrls).toEqual([
    {
      url: '/custom-element-with-special-stylesheets/style.css',
      baseUrl: 'http://localhost:7700/custom-element-with-special-stylesheets',
    },
  ]);
});

test('svg sprites', async ({ page }) => {
  await setupPage(page);

  await page.goto('/svg-sprites');

  const snapshot = await page.evaluate((): DOMSnapshotResult => {
    return globalThis.happoTakeDOMSnapshot({
      doc: document,
      element: document.querySelector('main')!,
    });
  });

  expect(snapshot.html).toMatch(/<use xlink:href="#my-icon"/s);
  expect(snapshot.html).toMatch(/<symbol id="my-icon"/s);
  expect(snapshot.assetUrls).toEqual([]);
  expect(snapshot.cssBlocks).toEqual([]);
});

test('clip strategy', async ({ page }) => {
  await setupPage(page);

  await page.goto('/svg-sprites');

  const snapshot = await page.evaluate((): DOMSnapshotResult => {
    return globalThis.happoTakeDOMSnapshot({
      doc: document,
      element: document.querySelector('main')!,
      strategy: 'clip',
    });
  });

  expect(snapshot.html).toMatch(/<use xlink:href="#my-icon"/s);
  expect((snapshot.html.match(/<symbol id="my-icon"/g) || []).length).toBe(1);
  expect(snapshot.html).toMatch(/<body/s);
  expect(snapshot.html).toMatch(/<\/body>/s);
  expect(snapshot.html).toMatch(/<main data-happo-clip="true">/s);
  expect(snapshot.assetUrls).toEqual([]);
  expect(snapshot.cssBlocks).toEqual([]);
});

test('unknown strategy', async ({ page }) => {
  await setupPage(page);

  await page.goto('/svg-sprites');

  await expect(
    page.evaluate(() => {
      return globalThis.happoTakeDOMSnapshot({
        doc: document,
        element: document.querySelector('main')!,
        // @ts-expect-error - test unknown strategy
        strategy: 'foobarbaz',
      });
    }),
  ).rejects.toThrow(/Unknown strategy: foobarbaz/);
});

test('constructed styles', async ({ page }) => {
  await setupPage(page);

  await page.goto('/constructed-styles');

  {
    const snapshot = await page.evaluate((): DOMSnapshotResult => {
      return globalThis.happoTakeDOMSnapshot({
        doc: document,
        element: document.body,
      });
    });

    expect(snapshot.html).toMatch(/<p>world<\/p>/s);
    expect(snapshot.html).toContain(
      'CSSStyleSheet.prototype.deleteRule does not work with Happo',
    );
    expect(snapshot.cssBlocks.length).toBe(4);
    expect(snapshot.cssBlocks[0]?.content?.replaceAll(/\s+/g, ' ').trim()).toEqual(
      'p { color: blue; }',
    );
    expect(snapshot.cssBlocks[1]?.content?.replaceAll(/\s+/g, ' ')).toEqual(
      'b { color: green; } :root { --my-custom-font: 400 1rem / 1.5rem Roboto; --my-custom-font-weight: 400; } p { font: var(--my-custom-font); font-weight: var(--my-custom-font-weight); }',
    );
    expect(snapshot.cssBlocks[2]?.content?.replaceAll(/\s+/g, ' ')).toEqual(
      'b { color: violet; }',
    );
    expect(snapshot.cssBlocks[3]?.content?.replaceAll(/\s+/g, ' ')).toEqual(
      ':root { --my-custom-font: 600 1em / 1em Comic; --my-custom-font-weight: 400; } p { font: var(--my-custom-font); font-weight: var(--my-custom-font-weight); }',
    );
    expect(snapshot.cssBlocks.map((block) => block.content).join(' ')).not.toMatch(
      /color: ?red/,
    );
  }

  // Take another snapshot to make sure that the styles are not duplicated.
  {
    const snapshot = await page.evaluate((): DOMSnapshotResult => {
      return globalThis.happoTakeDOMSnapshot({
        doc: document,
        element: document.body,
      });
    });

    expect(snapshot.html).toMatch(/<h1>Hello<\/h1>/s);
    expect(snapshot.cssBlocks.length).toBe(4);
    expect(snapshot.cssBlocks[0]?.content?.replaceAll(/\s+/g, ' ').trim()).toEqual(
      'p { color: blue; }',
    );
    expect(snapshot.cssBlocks[1]?.content?.replaceAll(/\s+/g, ' ')).toEqual(
      'b { color: green; } :root { --my-custom-font: 400 1rem / 1.5rem Roboto; --my-custom-font-weight: 400; } p { font: var(--my-custom-font); font-weight: var(--my-custom-font-weight); }',
    );
    expect(snapshot.cssBlocks[2]?.content?.replaceAll(/\s+/g, ' ')).toEqual(
      'b { color: violet; }',
    );
    expect(snapshot.cssBlocks[3]?.content?.replaceAll(/\s+/g, ' ')).toEqual(
      ':root { --my-custom-font: 600 1em / 1em Comic; --my-custom-font-weight: 400; } p { font: var(--my-custom-font); font-weight: var(--my-custom-font-weight); }',
    );
    expect(snapshot.cssBlocks.map((block) => block.content).join(' ')).not.toMatch(
      /color: ?red/,
    );
  }
});
