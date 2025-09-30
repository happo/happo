/* eslint-disable no-empty-pattern */
import { mergeTests, test as base } from '@playwright/test';

import { test as happoTest } from '../index.ts';

// Empty fixture to allow importing the fixture in other files
const baseTest = base.extend<{ double: (number: number) => number }>({
  double: async ({}, use) => {
    await use((number: number) => number * 2);
  },
});

export const test = mergeTests(baseTest, happoTest);
export { expect } from '@playwright/test';
