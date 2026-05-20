import type { ServerInfo } from '../../network/startServer.ts';
import startTestServer from '../../test-utils/startTestServer.ts';
import { expect, test } from './fixture.ts';

let serverInfo: ServerInfo;

test.beforeAll(async () => {
  serverInfo = await startTestServer('./src/playwright/__playwright__/fixtures');
});

test.afterAll(async () => {
  await serverInfo.close();
});

test('basic test', async ({ page, happoScreenshot, double }) => {
  await page.goto(`http://localhost:${serverInfo.port}/index.html`);

  const body = page.locator('body');
  const four = double(2);
  expect(four).toBe(4);

  await happoScreenshot(body, {
    component: 'Body',
    variant: 'inside app2',
  });
});

test.describe('retry handling', () => {
  // Force a single retry for the test below so we exercise the failed-attempt
  // snapshot cleanup added in src/playwright/index.ts.
  test.describe.configure({ retries: 1 });

  test('drops snapshots registered during a failed attempt', async ({
    page,
    happoScreenshot,
  }, testInfo) => {
    await page.goto(`http://localhost:${serverInfo.port}/index.html`);

    // Register a snapshot on every attempt. Without the cleanup, the failed
    // first attempt would leave a "Retry > Body / default" snapshot in the
    // report and the passing retry would land as "Retry > Body / default-2".
    await happoScreenshot(page.locator('body'), {
      component: 'Retry > Body',
      variant: 'default',
    });

    // Fail the first attempt only.
    if (testInfo.retry === 0) {
      throw new Error('Intentional failure to trigger a Playwright retry');
    }
  });
});
