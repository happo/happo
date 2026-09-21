import type { Config } from '../src/config/index.ts';
import { defineConfig } from '../src/config/index.ts';
import baseConfig from './happo.config.ts';

/**
 * Renders a Storybook that imports the Happo client runtime nowhere.
 *
 * Every other Storybook config here points at a fixture whose preview or
 * stories import `browser/register.ts`, so all of them would keep passing if
 * the runtime the CLI injects into the built package stopped working. This is
 * the one that would not: its fixture relies entirely on that injection, the
 * way a project following the setup docs now does.
 */
const config: Config = defineConfig({
  ...baseConfig,
  project: 'storybook-no-register',
  integration: {
    type: 'storybook',
    configDir: 'src/storybook/__tests__/storybook-app-no-register',
  },
});

export default config;
