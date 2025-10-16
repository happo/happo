import type { Config } from './src/config/index.ts';
import { defineConfig } from './src/config/index.ts';

const config: Config = defineConfig({
  apiKey: process.env.HAPPO_API_KEY ?? '',
  apiSecret: process.env.HAPPO_API_SECRET ?? '',

  projects: {
    default: {
      integrationType: 'storybook',
      targets: {
        chrome: {
          browserType: 'chrome',
          viewport: '1024x768',
        },

        chromeSmall: {
          browserType: 'chrome',
          viewport: '375x667',
        },

        accessibility: {
          browserType: 'accessibility',
          viewport: '375x667',
        },
      },
    },
  },
});

export default config;
