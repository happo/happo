import startTestServer from '../../test-utils/startTestServer.ts';
import { expect, test } from './fixture.ts';

let serverInfo: Awaited<ReturnType<typeof startTestServer>>;

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
