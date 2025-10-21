import { defineConfig } from 'cypress';

const config: ReturnType<typeof defineConfig> = defineConfig({
  e2e: {
    supportFile: './src/cypress/__cypress__/support/e2e.ts',
    specPattern: './src/cypress/__cypress__/**/*.spec.ts',
  },
});

export default config;
