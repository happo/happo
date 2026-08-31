import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { unzipSync } from 'fflate';

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/**
 * Reads an asset package back into a name → contents map, in whichever format
 * it was produced.
 *
 * tar.zst packages are unpacked with the system `tar` rather than with a
 * reader of our own, so tests check our writer against a real implementation
 * instead of against itself.
 */
export default function readArchive(buffer: Buffer): Map<string, Buffer> {
  if (!buffer.subarray(0, ZSTD_MAGIC.length).equals(ZSTD_MAGIC)) {
    const entries = unzipSync(new Uint8Array(buffer));
    return new Map(
      Object.entries(entries).map(([name, data]) => [name, Buffer.from(data)]),
    );
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'happo-archive-'));
  try {
    const tarPath = path.join(dir, 'archive.tar');
    const outDir = path.join(dir, 'out');
    fs.mkdirSync(outDir);
    fs.writeFileSync(tarPath, zlib.zstdDecompressSync(buffer));
    execFileSync('tar', ['-xf', tarPath, '-C', outDir]);

    const files = new Map<string, Buffer>();

    const walk = (current: string): void => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          files.set(
            path.relative(outDir, full).replaceAll('\\', '/'),
            fs.readFileSync(full),
          );
        }
      }
    };

    walk(outDir);
    return files;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The names of the entries in an asset package, with any files the OS may have
 * dropped in filtered out.
 */
export function archiveEntryNames(buffer: Buffer): Array<string> {
  return [...readArchive(buffer).keys()].filter(
    (entryName) => !entryName.includes('.DS_Store'),
  );
}
