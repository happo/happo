import { expect, test } from './fixture.ts';
import type { ServerInfo } from '../../test-utils/startServer.ts';
import startServer from '../../test-utils/startServer.ts';

let serverInfo: ServerInfo;

test.beforeAll(async () => {
  serverInfo = await startServer('./src/playwright/__playwright__/fixtures');
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
