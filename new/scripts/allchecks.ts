#!/usr/bin/env node

import { spawn } from 'node:child_process';

interface TaskResult {
  name: string;
  exitCode: number;
  output: string;
  error: string;
  duration: number;
}

async function runCommand(
  command: string,
  args: Array<string>,
  name: string,
  env: Record<string, string> = {},
): Promise<TaskResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'pipe',
      env: {
        ...process.env,
        ...env,
        // Force color output for various tools
        FORCE_COLOR: '1',
        COLOR: '1',
        TERM: 'xterm-256color',
      },
    });

    let output = '';
    let error = '';

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.stderr?.on('data', (data) => {
      error += data.toString();
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        name,
        exitCode: code || 0,
        output,
        error,
        duration,
      });
    });
  });
}

async function main() {
  // Use different ports for parallel test runs to avoid EADDRINUSE
  const testE2ePort = 5345;
  const playwrightE2ePort = testE2ePort + 1;

  await runCommand('pnpm', ['clean'], 'clean');

  const parallelTasks = [
    runCommand('pnpm', ['lint'], 'lint'),
    runCommand('pnpm', ['build:types'], 'build:types'),
    runCommand('pnpm', ['test'], 'test', {
      HAPPO_E2E_PORT: testE2ePort.toString(),
    }),
    runCommand('pnpm', ['test:playwright'], 'test:playwright', {
      HAPPO_E2E_PORT: playwrightE2ePort.toString(),
    }),
  ];

  console.log(`Running ${parallelTasks.length} tasks in parallel...`);

  // Use Promise.allSettled to handle each task completion individually
  const taskPromises = parallelTasks.map(async (taskPromise) => {
    try {
      const result = await taskPromise;
      const durationSeconds = (result.duration / 1000).toFixed(1);

      if (result.exitCode === 0) {
        console.log(`✅ ${result.name} passed (${durationSeconds}s)`);
        return { success: true, result };
      } else {
        console.error(
          `\n❌ ${result.name} failed with exit code ${result.exitCode} (${durationSeconds}s)`,
        );

        if (result.output) {
          console.error('STDOUT:');
          console.error(result.output);
        }

        if (result.error) {
          console.error('STDERR:');
          console.error(result.error);
        }

        return { success: false, result };
      }
    } catch (error) {
      console.error(`\n❌ Task failed with error:`, error);
      return { success: false, error };
    }
  });

  const results = await Promise.allSettled(taskPromises);
  const hasFailures = results.some((result) => {
    if (result.status === 'fulfilled') {
      return !result.value.success;
    }
    return true; // Promise was rejected
  });

  if (hasFailures) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error('Script failed:', error);
  process.exitCode = 1;
}
