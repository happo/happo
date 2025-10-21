import path from 'node:path';

import { defineConfig } from 'cypress';

import happoTask from '../../cypress/task.ts';
import startServer from '../../test-utils/startServer.ts';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const config: ReturnType<typeof defineConfig> = defineConfig({
  e2e: {
    supportFile: path.join(__dirname, 'support/e2e.ts'),
    specPattern: path.join(__dirname, 'tests/**/*.spec.ts'),

    async setupNodeEvents(on, config) {
      happoTask.register(on);
      const serverInfo = await startServer(path.join(__dirname, 'fixtures'));

      // Pass the port to the test environment
      config.env.SERVER_PORT = serverInfo.port;

      on('after:run', () => {
        serverInfo.close();
      });

      return config;
    },
  },
});

export default config;
