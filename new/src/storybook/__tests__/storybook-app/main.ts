import type { StorybookConfig } from '@storybook/react-webpack5';
import type { Configuration } from 'webpack';

const result: StorybookConfig = {
  stories: ['./**/*.stories.ts'],
  staticDirs: ['./public'],

  addons: ['storybook/actions', '../../preset.ts'],

  framework: {
    name: '@storybook/react-webpack5',
    options: {},
  },
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) =>
        prop.parent ? !/node_modules/.test(prop.parent.fileName) : true,
    },
  },
  webpackFinal: async (config: Configuration) => {
    // Ensure TypeScript files are handled properly
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];

    // Add TypeScript rule if not already present
    const hasTypeScriptRule = config.module.rules.some((rule) => {
      if (!rule) {
        return false;
      }
      if (typeof rule !== 'object') {
        return false;
      }
      return rule && rule.test && rule.test.toString().includes('tsx?');
    });

    if (!hasTypeScriptRule) {
      config.module.rules.push({
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
            },
          },
        ],
        exclude: /node_modules/,
      });
    }

    return config;
  },
};

export default result;
