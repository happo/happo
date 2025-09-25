import { defineConfig, devices } from '@playwright/test';

const config: ReturnType<typeof defineConfig> = defineConfig({
  testDir: 'src',
  testMatch: '**/__playwright__/**/*.test.ts',
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:7700',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
export default config;
