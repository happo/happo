import { test, expect } from '@playwright/test';

test('can interact with ModifyGlobalState story', async ({ page }) => {
  // Navigate to the ModifyGlobalState story
  await page.goto(
    'http://localhost:9900/?path=/story/stories--modify-global-state',
  );

  // Find and click the Happo tab
  const happoTab = await page.getByRole('tab', { name: 'Happo' });
  await happoTab.click();

  // Get the iframe context
  const frame = page.frameLocator('#storybook-preview-iframe');

  // Check that "clean up after me!" text is NOT present
  await expect(frame.locator('#global-state')).toBeHidden();
});
