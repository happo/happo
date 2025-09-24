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

export function mock(files: Files = {}): string {
  if (tempDir) {
    throw new Error('tmpfs mock() called before restore()');
  }

  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmpfs'));
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

    fs.writeFileSync(path.join(tempDir, filePath), content);
  }

  return tempDir;
}

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
