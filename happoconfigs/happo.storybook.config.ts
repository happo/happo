import type { Config } from '../src/config/index.ts';
import { defineConfig } from '../src/config/index.ts';
import baseConfig from './happo.config.ts';

const config: Config = defineConfig({
  ...baseConfig,
  project: 'storybook',
  integration: {
    type: 'storybook',
    configDir: 'src/storybook/__tests__/storybook-app',
  },
});

export default config;
