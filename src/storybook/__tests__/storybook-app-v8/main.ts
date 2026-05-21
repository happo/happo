import type { StorybookConfig } from '@storybook/react-vite';

// Minimal Storybook config compatible with v8, v9, and v10.
// Intentionally avoids 'storybook/actions' and 'storybook/test', which did
// not exist as storybook package exports in Storybook v8.
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
