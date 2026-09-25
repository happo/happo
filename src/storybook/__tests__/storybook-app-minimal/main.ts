import type { StorybookConfig } from '@storybook/react-vite';

// The smallest Storybook config Happo supports: no addons beyond Happo's own
// preset, and none of the optional 'storybook/*' package exports that the
// fuller fixture in storybook-app pulls in.
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
