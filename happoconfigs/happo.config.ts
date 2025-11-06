import type { Config } from '../src/config/index.ts';
import { defineConfig } from '../src/config/index.ts';

const config: Config = defineConfig({
  apiKey: process.env.HAPPO_API_KEY ?? '',
  apiSecret: process.env.HAPPO_API_SECRET ?? '',

  integration: { type: 'storybook' },

  targets: {
    chrome: {
      type: 'chrome',
      viewport: '1024x768',
    },

    chromeSmall: {
      type: 'chrome',
      viewport: '375x667',
    },

    accessibility: {
      type: 'accessibility',
      viewport: '375x667',
    },
  },
});

export default config;
