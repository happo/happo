import type { Config } from '../src/config/index.ts';
import { defineConfig } from '../src/config/index.ts';
import baseConfig from './happo.config.ts';

const config: Config = defineConfig({
  ...baseConfig,
  project: 'cypress',
  integration: {
    type: 'cypress',
    autoApplyPseudoStateAttributes: true,
  },
});

export default config;
