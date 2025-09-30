/* eslint-disable no-empty-pattern */
import type {
  Fixtures,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestType,
} from '@playwright/test';
import { mergeTests, test as base } from '@playwright/test';

import type { TestFixtures, WorkerFixtures } from '../index.ts';
import { test as happoTest } from '../index.ts';

interface ExtraTestFixtures extends Fixtures {
  double: (number: number) => number;
}

// Empty fixture to allow importing the fixture in other files
const baseTest = base.extend<ExtraTestFixtures>({
  double: async ({}, use) => {
    await use((number: number) => number * 2);
  },
});

export const test: TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & TestFixtures & ExtraTestFixtures,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions & WorkerFixtures
> = mergeTests(baseTest, happoTest);

export { expect } from '@playwright/test';
