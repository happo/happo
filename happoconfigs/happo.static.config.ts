import type { Config } from '../src/config/index.ts';
import { defineConfig } from '../src/config/index.ts';
import baseConfig from './happo.config.ts';

const config: Config = defineConfig({
  ...baseConfig,
  project: 'static',
  integration: {
    type: 'static',
    generateStaticPackage: async () => ({
      rootDir: './tmp/happo-static',
      entryPoint: 'bundle.js',
    }),
  },
});

export default config;
