import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import type { ServerInfo } from '../../network/startServer.ts';
import startTestServer from '../../test-utils/startTestServer.ts';
import buildStorybookPackage from '../index.ts';

/**
 * The Happo worker drives a Storybook through a `window.happo` object. That
 * object used to come from an `import 'happo/storybook/register'` in the
 * project's `.storybook/preview` file, and a project that forgot the import
 * got a job that rendered nothing and failed ten seconds later with
 * "Timed out while waiting for window.happo".
 *
 * `buildStorybookPackage()` now puts the runtime into the package itself, so
 * the import is optional. This drives a package built from a fixture that
 * does not import it anywhere, the way a worker would, against whichever
 * Storybook version is installed.
 */

// Nothing under this config dir imports the runtime -- see its preview.ts.
const CONFIG_DIR = 'src/storybook/__tests__/storybook-app-v8';
const OUTPUT_DIR = '.out-injected-runtime';

let server: ServerInfo;

test.beforeAll(async () => {
  await buildStorybookPackage({ configDir: CONFIG_DIR, outputDir: OUTPUT_DIR });
  server = await startTestServer(OUTPUT_DIR);
});

test.afterAll(async () => {
  await server?.close();
  await fs.promises.rm(OUTPUT_DIR, { recursive: true, force: true });
});

// Building a Storybook is not fast, and this renders every story in it.
test.describe.configure({ timeout: 120_000 });

test('the package carries the runtime rather than relying on the preview', () => {
  const iframe = fs.readFileSync(path.join(OUTPUT_DIR, 'iframe.html'), 'utf8');

  expect(iframe).toMatch(/<script[^>]+src="\.\/happo-storybook-runtime\.js"/);
});

test('the injected runtime alone can drive the Storybook', async ({ page }) => {
  const pageErrors: Array<string> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`http://localhost:${server.port}/iframe.html`);

  // What the worker waits for, and what used to time out. Given its own
  // timeout, well short of the one covering the Storybook build above, so a
  // regression here fails in seconds pointing at this line rather than
  // running out the whole test's clock.
  await page.waitForFunction(
    () => typeof (globalThis as { happo?: { init?: unknown } }).happo?.init === 'function',
    undefined,
    { timeout: 30_000 },
  );

  const rendered = await page.evaluate(async () => {
    const { happo } = globalThis as unknown as {
      happo: {
        init: (config: Record<string, unknown>) => Promise<void>;
        nextExample: () => Promise<
          { component: string; variant: string } | undefined
        >;
      };
    };

    await happo.init({});

    const examples: Array<string> = [];
    for (let i = 0; i < 20; i++) {
      const example = await happo.nextExample();
      if (!example) {
        break;
      }
      examples.push(`${example.component} | ${example.variant}`);
    }
    return examples;
  });

  // `Excluded` carries `parameters.happo: false`, and `Themed` is rendered
  // once per theme -- both decided by the runtime, so seeing them here means
  // the injected copy is really the one in charge.
  expect(rendered.toSorted()).toEqual([
    'Simple | Basic',
    'Simple | Themed [dark]',
    'Simple | Themed [light]',
  ]);
  expect(pageErrors).toEqual([]);
});
