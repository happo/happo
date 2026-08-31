import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import createTar from '../createTar.ts';

const execFileAsync = promisify(execFile);

const BLOCK_SIZE = 512;

function u8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Writes a tar to disk and extracts it with the system `tar`, so we are
 * checking our output against a real implementation rather than against our
 * own reader.
 */
async function extractWithSystemTar(
  tar: Buffer,
): Promise<Map<string, Buffer>> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'happo-tar-'));
  try {
    const tarPath = path.join(dir, 'archive.tar');
    const outDir = path.join(dir, 'out');
    await fs.promises.mkdir(outDir);
    await fs.promises.writeFile(tarPath, tar);
    await execFileAsync('tar', ['-xf', tarPath, '-C', outDir]);

    const files = new Map<string, Buffer>();
    for await (const entry of fs.promises.glob('**/*', {
      cwd: outDir,
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      const full = path.join(entry.parentPath, entry.name);
      files.set(
        path.relative(outDir, full).replaceAll('\\', '/'),
        await fs.promises.readFile(full),
      );
    }
    return files;
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

test('produces a byte-identical archive for the same input', () => {
  const entries = [
    { name: 'a.txt', data: u8('one') },
    { name: 'nested/b.txt', data: u8('two') },
  ];

  const first = createTar(entries);
  const second = createTar(entries);

  assert.deepStrictEqual(first, second);
});

test('output does not depend on ambient state', () => {
  // The archive must not pick up the current time, umask, uid or gid, since
  // the resulting hash is used to dedupe uploads across machines.
  const entries = [{ name: 'a.txt', data: u8('one') }];
  const first = createTar(entries);
  const second = createTar(entries);

  assert.deepStrictEqual(first, second);

  // mtime, uid, gid and mode fields of the first header must be fixed values.
  const header = first.subarray(0, BLOCK_SIZE);
  assert.strictEqual(header.toString('utf8', 100, 108), '0000644\0');
  assert.strictEqual(header.toString('utf8', 108, 116), '0000000\0');
  assert.strictEqual(header.toString('utf8', 116, 124), '0000000\0');
  assert.strictEqual(header.toString('utf8', 136, 148), '00000000000\0');
});

test('is readable by the system tar', async () => {
  const tar = createTar([
    { name: 'index.html', data: u8('<html></html>') },
    { name: 'assets/app.js', data: u8('console.log(1);') },
    { name: 'assets/nested/deep.css', data: u8('body { color: red; }') },
  ]);

  const files = await extractWithSystemTar(tar);

  assert.deepStrictEqual(
    [...files.keys()].toSorted(),
    ['assets/app.js', 'assets/nested/deep.css', 'index.html'],
  );
  assert.strictEqual(files.get('index.html')?.toString(), '<html></html>');
  assert.strictEqual(files.get('assets/app.js')?.toString(), 'console.log(1);');
});

test('round-trips names longer than the 100 byte ustar name field', async () => {
  const longName = `assets/${'nested/'.repeat(20)}file.js`;
  assert(longName.length > 100);

  const files = await extractWithSystemTar(
    createTar([{ name: longName, data: u8('deep contents') }]),
  );

  assert.strictEqual(files.get(longName)?.toString(), 'deep contents');
});

test('writes non-ASCII names as UTF-8', () => {
  const name = 'assets/ünïcode-æøå-日本語.txt';

  const tar = createTar([{ name, data: u8('unicode contents') }]);

  // Asserted on the header bytes rather than by extracting to disk: Windows
  // normalizes filenames on the way through the filesystem, so a round trip
  // there tells us about the filesystem rather than about what we wrote.
  const nameField = tar.subarray(0, 100);
  const end = nameField.indexOf(0);
  assert.strictEqual(nameField.toString('utf8', 0, end), name);

  // The name is measured in bytes, not characters, so a name that fits in 100
  // characters but not 100 bytes still has to be counted correctly.
  assert.strictEqual(Buffer.byteLength(name, 'utf8'), 37);
});

test('round-trips empty files', async () => {
  const files = await extractWithSystemTar(
    createTar([
      { name: 'empty.txt', data: u8('') },
      { name: 'after.txt', data: u8('still here') },
    ]),
  );

  assert.strictEqual(files.get('empty.txt')?.length, 0);
  assert.strictEqual(files.get('after.txt')?.toString(), 'still here');
});

test('round-trips sizes around the 512 byte block boundary', async () => {
  const sizes = [1, 511, 512, 513, 1023, 1024, 1025];

  const files = await extractWithSystemTar(
    createTar(
      sizes.map((size) => ({
        name: `size-${size}.bin`,
        data: u8('x'.repeat(size)),
      })),
    ),
  );

  for (const size of sizes) {
    assert.strictEqual(
      files.get(`size-${size}.bin`)?.length,
      size,
      `size-${size}.bin should be ${size} bytes`,
    );
  }
});

test('round-trips binary content byte for byte', async () => {
  const binary = new Uint8Array(
    Array.from({ length: 5000 }, (_, i) => (i * 31) % 256),
  );

  const files = await extractWithSystemTar(
    createTar([{ name: 'image.png', data: binary }]),
  );

  assert.deepStrictEqual(
    new Uint8Array(files.get('image.png') as Buffer),
    binary,
  );
});

test('ends with the two zero blocks that mark end of archive', () => {
  const tar = createTar([{ name: 'a.txt', data: u8('hi') }]);

  assert.strictEqual(tar.length % BLOCK_SIZE, 0);
  assert.deepStrictEqual(
    tar.subarray(tar.length - BLOCK_SIZE * 2),
    Buffer.alloc(BLOCK_SIZE * 2),
  );
});

test('rejects names that cannot be represented', () => {
  assert.throws(
    () => createTar([{ name: 'x'.repeat(300), data: u8('hi') }]),
    /too long/i,
  );
});
