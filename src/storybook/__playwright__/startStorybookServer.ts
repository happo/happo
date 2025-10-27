import { spawn } from 'node:child_process';
import { promisify } from 'node:util';

const sleep = promisify(setTimeout);

export interface StorybookServerInfo {
  close: () => Promise<void>;
  port: number;
}

export default function startStorybookServer(
  port: number = 9900,
): Promise<StorybookServerInfo> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['storybook:dev'], {
      stdio: 'pipe',
      env: { ...process.env, PORT: port.toString() },
    });

    let resolved = false;

    const cleanup = () => {
      if (child && !child.killed) {
        child.kill('SIGTERM');
      }
    };

    // Handle process exit
    child.on('exit', (code) => {
      if (!resolved) {
        reject(new Error(`Storybook server exited with code ${code}`));
      }
    });

    // Handle process error
    child.on('error', (error) => {
      if (!resolved) {
        cleanup();
        reject(error);
      }
    });

    // Listen for server ready message
    child.stdout?.on('data', (data) => {
      const output = data.toString();
      if (
        output.includes('Local:') &&
        output.includes(`http://localhost:${port}`) &&
        !resolved
      ) {
        resolved = true;
        resolve({
          close: async () => {
            cleanup();
            // Wait a bit for graceful shutdown
            await sleep(1000);
          },
          port,
        });
      }
    });

    child.stderr?.on('data', (data) => {
      const output = data.toString();
      // Log errors but don't fail unless it's a critical error
      if (output.includes('Error:') && !output.includes('EADDRINUSE')) {
        console.error('Storybook server error:', output);
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error('Storybook server failed to start within 30 seconds'));
      }
    }, 30_000);
  });
}
