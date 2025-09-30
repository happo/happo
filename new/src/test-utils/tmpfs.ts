import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let originalCwd: string = '';
let tempDir: string = '';

interface Files {
  [key: string]: string | Files;
}

function flattenFiles(files: Files, prefix: string = ''): Record<string, string> {
  const flattened: Record<string, string> = {};

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(prefix, filePath);
    if (typeof content === 'object' && content !== null) {
      Object.assign(flattened, flattenFiles(content, fullPath));
    } else if (typeof content === 'string') {
      flattened[fullPath] = content;
    }
  }

  return flattened;
}

/**
 * Testing util to create a temporary directory with the given files and chdir
 * into it
 *
 * @example
 * it('is a test', () => {
 *   tmpfs.mock({
 *     'test.txt': 'I like pizza',
 *   });
 *
 *   assert.strictEqual(fs.readFileSync(path.join(tmpfs.getTempDir(), 'test.txt'), 'utf8'), 'I like pizza');
 *
 *   tmpfs.restore();
 * });
 * });
 */
export function mock(files: Files = {}): string {
  if (tempDir) {
    throw new Error('tmpfs.mock() called before tmpfs.restore()');
  }

  originalCwd = process.cwd();

  tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tmpfs')));
  process.chdir(tempDir);

  // Flatten the files object
  const flattenedFiles = flattenFiles(files);

  // Create specified files
  for (const [filePath, content] of Object.entries(flattenedFiles)) {
    const dir = path.dirname(filePath);
    if (dir !== '.') {
      // Ensure the directory exists within the temp dir
      fs.mkdirSync(path.join(tempDir, dir), { recursive: true });
    }

    writeFile(filePath, content);
  }

  return tempDir;
}

/**
 * Restores the original working directory and chdirs back to the original
 * directory
 */
export function restore(): void {
  if (!originalCwd || !tempDir) {
    // Avoid errors if restore is called without mock or multiple times
    return;
  }

  try {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (err) {
    // Log potential cleanup errors but don't fail the test run
    console.error(`Error cleaning up temp directory ${tempDir}:`, err);
  } finally {
    originalCwd = '';
    tempDir = '';
  }
}

export function getTempDir(): string {
  return tempDir;
}

function assertMocked(caller: string): void {
  if (!tempDir) {
    throw new Error(`tmpfs.${caller}() called before tmpfs.mock()`);
  }
}

/**
 * Writes a file to the temporary directory
 *
 * @example
 * it('is a test', () => {
 *   tmpfs.mock({});
 *   tmpfs.writeFile('test.txt', 'Hello, world!');
 *   assert.strictEqual(fs.readFileSync(path.join(tmpfs.getTempDir(), 'test.txt'), 'utf8'), 'Hello, world!');
 *   tmpfs.restore();
 * });
 */
export function writeFile(filePath: string, content: string): void {
  assertMocked('writeFile');

  if (filePath.startsWith('/')) {
    throw new Error('filePath cannot start with a slash');
  }

  if (filePath.includes('..')) {
    throw new Error('filePath cannot contain ..');
  }

  const fullPath = path.join(tempDir, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  fs.writeFileSync(fullPath, content);
}

/**
 * Executes a command in the temporary directory
 *
 * @example
 * it('is a test', () => {
 *   tmpfs.mock({});
 *   const result = tmpfs.exec('echo', ['Hello, world!']);
 *   assert.strictEqual(result, 'Hello, world!\n');
 *   tmpfs.restore();
 * });
 */
export function exec(command: string, args?: string[]): string {
  assertMocked('exec');

  const result = spawnSync(command, args, {
    cwd: tempDir,
  });

  if (result.status !== 0) {
    throw new Error(
      `Command \`${[command, ...(args ?? [])].join(' ')}\` failed: ${result.stderr}`,
    );
  }

  return result.stdout.toString();
}

/**
 * Initializes a git repository in the temporary directory
 *
 * @example
 * it('is a test', () => {
 *   tmpfs.mock({});
 *   tmpfs.gitInit();
 *   tmpfs.writeFile('test.txt', 'I like pizza');
 *   tmpfs.exec('git', ['add', 'test.txt']);
 *   tmpfs.exec('git', ['commit', '-m', 'Add test.txt']);
 *   tmpfs.restore();
 * });
 */
export function gitInit(): void {
  assertMocked('gitInit');

  exec('git', ['init']);
  exec('git', ['config', 'user.name', 'Test User']);
  exec('git', ['config', 'user.email', 'test@example.com']);
  exec('git', ['branch', '-M', 'main']);
  exec('git', ['add', '.']);
  exec('git', ['commit', '-m', 'Initial commit', '--allow-empty']);
}
