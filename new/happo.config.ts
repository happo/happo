import { defineConfig } from './src/config/index.js';
import type { Config } from './src/config/index.ts';

const config: Config = defineConfig({
  targets: {
    chrome: {
      viewport: '1024x768',
    },
  },
});

export default config;
