import type { Config } from '../src/config/index.ts';
import { defineConfig } from '../src/config/index.ts';
import baseConfig from './happo.config.ts';

const config: Config = defineConfig({
  ...baseConfig,
  project: 'pages',
  integration: {
    type: 'pages',
    pages: [
      {
        url: 'https://docs.happo.io/',
        title: 'Docs',
      },
      {
        url: 'https://docs.happo.io/',
        title: 'Docs with selector',
        waitForSelector: 'h1',
      },
      {
        url: 'https://docs.happo.io/',
        title: 'Docs with content',
        waitForContent: 'Getting started',
      },
    ],
  },
});

export default config;
