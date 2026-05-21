import type { Config } from '../src/config/index.ts';
import { defineConfig } from '../src/config/index.ts';
import baseConfig from './happo.config.ts';

const config: Config = defineConfig({
  ...baseConfig,
  project: 'storybook-v8',
  integration: {
    type: 'storybook',
    configDir: 'src/storybook/__tests__/storybook-app-v8',
  },
});

export default config;
