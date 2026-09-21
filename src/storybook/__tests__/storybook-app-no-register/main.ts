import type { StorybookConfig } from '@storybook/react-vite';

/**
 * A Storybook that never imports the Happo client runtime.
 *
 * Its whole job is to be the case a new account hits: `happo.config.ts` is set
 * up, the CLI is installed, and `.storybook/preview` says nothing about Happo.
 * That used to produce a job that rendered nothing and failed with "Timed out
 * while waiting for window.happo"; `buildStorybookPackage()` now puts the
 * runtime into the package, and `injectedRuntime.spec.ts` drives this fixture
 * to prove it.
 *
 * Deliberately separate from the other fixtures. `storybook-app` cannot serve
 * this purpose -- one of its stories imports `forceHappoScreenshot`, so the
 * runtime is in its bundle whatever its preview does -- and a fixture shared
 * with the version-support tests would lose the coverage the moment those
 * tests were restructured.
 */
const result: StorybookConfig = {
  stories: ['./**/*.stories.ts'],

  addons: ['../../preset.ts'],

  framework: {
    name: '@storybook/react-vite',
    options: {},
  },

  typescript: {
    check: false,
  },
};

export default result;
