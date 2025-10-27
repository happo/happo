import { expect, test } from '@playwright/test';

import startStorybookServer, {
  type StorybookServerInfo,
} from './startStorybookServer.ts';

let serverInfo: StorybookServerInfo;

test.beforeAll(async () => {
  serverInfo = await startStorybookServer(9900);
});

test.afterAll(async () => {
  await serverInfo.close();
});

test('can interact with ModifyGlobalState story', async ({ page }) => {
  // Navigate to the ModifyGlobalState story
  await page.goto(
    `http://localhost:${serverInfo.port}/?path=/story/stories--modify-global-state`,
  );

  // Find and click the Happo tab
  const happoTab = await page.getByRole('tab', { name: 'Happo' });
  await happoTab.click();

  // Get the iframe context
  const frame = page.frameLocator('#storybook-preview-iframe');

  // Check that "clean up after me!" text is NOT present
  await expect(frame.locator('#global-state')).toBeHidden();
});
