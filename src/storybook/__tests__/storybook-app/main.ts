import type { StorybookConfig } from '@storybook/react-vite';

const result: StorybookConfig = {
  stories: ['./**/*.stories.ts'],
  staticDirs: ['./public'],

  addons: ['storybook/actions', '../../preset.ts'],

  framework: {
    name: '@storybook/react-vite',
    options: {},
  },

  typescript: {
    check: false,
  },
};

export default result;
