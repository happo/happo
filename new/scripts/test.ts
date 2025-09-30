#!/usr/bin/env node

/**
 * This is a helper for running tests nicely in this repo.
 *
 * Requirements:
 *
 * - fzf
 */

import { spawn, spawnSync } from 'node:child_process';
import { watch } from 'node:fs';
import readline from 'node:readline';
import Reporters from 'node:test/reporters';
import { parseArgs } from 'node:util';

let selectedFiles: Array<string> = [];

type Reporter = keyof typeof Reporters | 'github';
const REPORTERS: Record<Reporter, string> = {
  dot: 'dot',
  github: '@reporters/github',
  junit: 'junit',
  lcov: 'lcov',
  spec: 'spec',
  tap: 'tap',
};

// Parse command line arguments
const { values: args, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    pattern: {
      type: 'string',
      short: 'p',
      description: 'Test name pattern to match',
    },
    watch: {
      type: 'boolean',
      short: 'w',
      description: 'Watch mode',
    },
    coverage: {
      type: 'boolean',
      short: 'c',
      description: 'Show coverage',
    },
    reporter: {
      type: 'string',
      short: 'r',
      description:
        'Reporter to use. Defaults to "spec" when running locally. When running in GitHub Actions, the github reporter is added automatically.',
      default: ['spec'],
      multiple: true,
    },
    help: {
      type: 'boolean',
      short: 'h',
      description: 'Show help',
    },
  },
});

if (process.env.GITHUB_ACTION) {
  args.reporter.unshift('github');
}

// If positional arguments are provided, treat them as patterns
const patterns = positionals.length > 0 ? positionals : [];

// Also include pattern from --pattern option
if (args.pattern) {
  patterns.push(args.pattern);
}

// Handle help
if (args.help) {
  help();
  process.exit(0);
}

function listFiles() {
  // Use find to get test files, then fzf to filter them
  const find = spawnSync(
    'find',
    ['src', '-type', 'f', '-name', '*.test.ts', '!', '-path', '*/__playwright__/*'],
    {
      stdio: ['inherit', 'pipe', 'inherit'],
    },
  );

  return find.stdout.toString().trim().split('\n').filter(Boolean);
}

function pickFiles() {
  const fzf = spawnSync('fzf', {
    input: listFiles().join('\n'),
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  selectedFiles = fzf.stdout.toString().trim().split('\n').filter(Boolean);
}

function pickFilesWithPattern(pattern: string) {
  // Get all test files and use fzf non-interactively to filter by pattern
  const allFiles = listFiles();

  if (allFiles.length === 0) {
    console.log('No test files found');
    return [];
  }

  // Use fzf non-interactively with the pattern as query
  const fzf = spawnSync('fzf', ['-f', pattern], {
    input: allFiles.join('\n'),
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const result = fzf.stdout.toString().trim().split('\n').filter(Boolean);

  if (result.length === 0) {
    console.log(`No files found matching pattern: ${pattern}`);
  }

  return result;
}

function getFilesToRun(
  patterns: Array<string>,
  selectedFiles: Array<string>,
): Array<string> {
  // Handle command line patterns - now use fzf to select files matching
  // patterns
  if (patterns.length > 0) {
    // Use fzf to select files that match the patterns
    const pattern = patterns.join(' ');
    const selectedFiles = pickFilesWithPattern(pattern);

    if (selectedFiles.length > 0) {
      console.info(
        `Running ${selectedFiles.length} test files: ${selectedFiles.join(', ')}`,
      );
    } else {
      console.info(`No files found matching pattern: ${pattern}`);
    }

    return selectedFiles;
  } else if (selectedFiles.length) {
    // Use selected files
    console.info(
      `Running ${selectedFiles.length} test files: ${selectedFiles.join(', ')}`,
    );
    return selectedFiles;
  } else {
    // If no specific files selected, run all test files
    const allFiles = listFiles();
    console.info(`Running all ${allFiles.length} test files`);
    return allFiles;
  }
}

let currentProcess: ReturnType<typeof spawn> | null = null;

function restoreTerminal() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
}

// Ensure terminal is restored on any exit
process.on('exit', restoreTerminal);
process.on('SIGTERM', () => {
  restoreTerminal();
  process.exit(0);
});

function run() {
  const nodeTestArgs = ['--test'];

  if (args.coverage) {
    nodeTestArgs.push(
      '--experimental-test-coverage',
      '--test-coverage-exclude="**/__tests__/**"',
    );
  }

  for (const reporter of args.reporter) {
    if (REPORTERS[reporter]) {
      nodeTestArgs.push(
        `--test-reporter=${REPORTERS[reporter]}`,
        '--test-reporter-destination=stdout',
      );
    } else {
      console.warn(`Unknown reporter: ${reporter}`);
    }
  }

  // The positional list of files  needs to come after other flags
  const filesToRun = getFilesToRun(patterns, selectedFiles);
  nodeTestArgs.push(...filesToRun);

  currentProcess = spawn(process.execPath, nodeTestArgs, { stdio: 'inherit' });

  // Forward SIGINT to the child process
  process.on('SIGINT', () => {
    if (currentProcess && !currentProcess.killed) {
      currentProcess.kill('SIGINT');
    }
  });

  if (args.watch) {
    currentProcess.on('exit', () => {
      currentProcess = null;
      // Print the commands again after the test run so the user can see how to
      // use this again.
      help();
    });
  }
}

function help() {
  console.log('(p) pick files  (a) run all  (Enter) run  (q) quit');
}

function watchFiles() {
  const directories = ['src'];
  const watchers: Array<{ close: () => void }> = [];

  run();

  for (const dir of directories) {
    try {
      const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
        if (filename) {
          console.log(`File ${eventType}: ${filename}`);
          run();
        }
      });
      watchers.push(watcher);
    } catch (err) {
      console.warn(`Could not watch directory ${dir}:`, err.message);
    }
  }

  // Return a cleanup function
  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

if (args.watch) {
  // Start watch mode and interactive interface
  const cleanup = watchFiles();

  // Set up interactive interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  readline.emitKeypressEvents(process.stdin, rl);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  // Handle SIGINT (Ctrl+C) properly
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, cleaning up...');
    cleanup();
    if (currentProcess && !currentProcess.killed) {
      currentProcess.kill('SIGINT');
    }
    process.exit(0);
  });

  process.stdin.on('keypress', async (_, key) => {
    if (!key) {
      return;
    }

    // If a test is currently running, interrupt it
    if (currentProcess && !currentProcess.killed) {
      console.log('\nInterrupting current test run...');
      currentProcess.kill('SIGINT');
    }

    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      process.exit(0);
    }

    if (key.name === 'p') {
      pickFiles();
      patterns.length = 0; // Clear command line patterns when picking files interactively
      run();
    }

    if (key.name === 'a') {
      selectedFiles = [];
      patterns.length = 0; // Clear patterns
      run();
    }

    if (key.name === 'return' || key.sequence === '\r') {
      run();
    }
  });
} else {
  run();
}
