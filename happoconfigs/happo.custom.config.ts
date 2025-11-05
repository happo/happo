import type { Config } from '../src/config/index.ts';
import { defineConfig } from '../src/config/index.ts';
import baseConfig from './happo.config.ts';

const config: Config = defineConfig({
  ...baseConfig,
  project: 'custom',
  integration: {
    type: 'custom',
    build: async () => ({
      rootDir: './tmp/happo-custom',
      entryPoint: 'bundle.js',
    }),
  },
});

export default config;
