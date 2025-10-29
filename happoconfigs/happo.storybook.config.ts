import type { Config } from '../src/config/index.ts';
import { defineConfig } from '../src/config/index.ts';
import baseConfig from './happo.config.ts';

const version = process.env.HAPPO_STORYBOOK_VERSION ?? '10';

const config: Config = defineConfig({
  ...baseConfig,
  project: `storybook-v${version}`,
  integration: {
    type: 'storybook',
    configDir: 'src/storybook/__tests__/storybook-app',
  },
});

export default config;
