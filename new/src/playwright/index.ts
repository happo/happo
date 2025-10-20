/* eslint-disable no-empty-pattern */
import path from 'node:path';

import type {
  ElementHandle,
  Locator,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestType,
} from '@playwright/test';
import { test as base } from '@playwright/test';

import Controller from '../e2e/controller.ts';

const pathToBrowserBuild = path.resolve(
  import.meta.dirname,
  '../../dist/browser/main.bundle.js',
);

const controller = new Controller();

type ScreenshotFunction = (
  handleOrLocator: ElementHandle | Locator | null,
  options: {
    component: string;
    variant: string;
    snapshotStrategy?: 'hoist' | 'clip';
    [key: string]: unknown;
  },
) => Promise<void>;

export interface TestFixtures {
  happoScreenshot: ScreenshotFunction;
  _happoForEachTest: void;
}

export interface WorkerFixtures {
  _happoForEachWorker: void;
}

const BATCH_SIZE = 4;
let specCounter = 0;

// Extend Playwright's `test` object with the `screenshot` fixture
export const test: TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & TestFixtures,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions & WorkerFixtures
> = base.extend<TestFixtures, WorkerFixtures>({
  // Runs once per worker, before any test starts
  _happoForEachWorker: [
    async ({}, use) => {
      await controller.init(process.env.HAPPO_PROJECT ?? 'default');
      await use();

      // It's possible that the call to `finish` is not needed, since it's
      // called in the `_happoSpecWrapper` function. In that case, the finish
      // call will be a no-op.
      await controller.finish();
    },
    { scope: 'worker', auto: true },
  ],

  _happoForEachTest: [
    async ({}, use) => {
      specCounter++;
      await use();
      if (specCounter % BATCH_SIZE === 0) {
        // Send batch of 4 screenshots to Happo
        await controller.finish();
        // Clear the controller to make it ready for the next batch
        await controller.init(process.env.HAPPO_PROJECT ?? 'default');
      }
    },
    { scope: 'test', auto: true },
  ],

  // Injects the Happo script before each test
  // This defines `globalThis.window.happo`
  page: async ({ page }, use) => {
    await page.addInitScript({ path: pathToBrowserBuild });
    await use(page);
  },

  // Passes down the happoScreenshot function as a fixture
  happoScreenshot: async ({ page }, use) => {
    const happoScreenshot: ScreenshotFunction = async (
      handleOrLocator,
      { component, variant, snapshotStrategy = 'hoist', ...rest },
    ) => {
      if (!controller.isActive()) {
        return;
      }

      if (!handleOrLocator) {
        throw new Error(
          'handleOrLocator must be an element handle or a locator, received null.',
        );
      }
      if (handleOrLocator instanceof Promise) {
        throw new TypeError(
          'handleOrLocator must be an element handle or a locator, received a promise. Please use `await` to resolve the handleOrLocator.',
        );
      }
      if (!component) {
        throw new Error('Missing `component`');
      }
      if (!variant) {
        throw new Error('Missing `variant`');
      }

      const elementHandle =
        'elementHandle' in handleOrLocator
          ? await handleOrLocator.elementHandle()
          : handleOrLocator;

      if (!elementHandle) {
        throw new Error('elementHandle cannot be null or undefined');
      }

      const snapshot = await page.evaluate(
        ({ element, strategy }) => {
          if (!globalThis.happo) {
            throw new Error('globalThis.happo is not defined');
          }

          const { happo } = globalThis;
          const { takeDOMSnapshot } = happo;

          if (!takeDOMSnapshot) {
            throw new Error('globalThis.happo.takeDOMSnapshot is not defined');
          }

          return takeDOMSnapshot({
            doc: element.ownerDocument,
            element,
            strategy,
          });
        },
        {
          element: elementHandle,
          strategy: snapshotStrategy,
        },
      );

      await controller.registerSnapshot({
        ...snapshot,
        component,
        variant,
        ...rest,
      });
    };

    await use(happoScreenshot);
  },
});
