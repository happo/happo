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
 * Writes a tar to disk and extracts it with the system `tar`, so we check our
 * output against a real implementation rather than against ourselves.
 *
 * Only usable for names the host filesystem can represent — Linux caps a
 * single path component at 255 bytes and Windows normalizes Unicode. Assert on
 * the archive bytes instead when a name cannot survive a trip through disk.
 */
async function extractWithSystemTar(tar: Buffer): Promise<Map<string, Buffer>> {
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

test('produces a byte-identical archive for the same input', async () => {
  const entries = [
    { name: 'a.txt', data: u8('one') },
    { name: 'nested/b.txt', data: u8('two') },
  ];

  const first = await createTar(entries);
  const second = await createTar(entries);

  assert.deepStrictEqual(first, second);
});

test('output does not depend on the current time', async () => {
  // The hash of this archive is the dedupe key for uploads, so the same
  // content has to produce the same bytes on every machine and every run.
  const entries = [{ name: 'a.txt', data: u8('one') }];

  const first = await createTar(entries);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const second = await createTar(entries);

  assert.deepStrictEqual(first, second);

  // mtime, uid and gid are pinned rather than read from the environment.
  const header = first.subarray(0, BLOCK_SIZE);
  const octal = (offset: number, length: number) =>
    Number.parseInt(header.toString('utf8', offset, offset + length).trim(), 8);
  assert.strictEqual(octal(136, 12), 0, 'mtime should be 0');
  assert.strictEqual(octal(108, 8), 0, 'uid should be 0');
  assert.strictEqual(octal(116, 8), 0, 'gid should be 0');
});

test('is readable by the system tar', async () => {
  const files = await extractWithSystemTar(
    await createTar([
      { name: 'index.html', data: u8('<html></html>') },
      { name: 'assets/app.js', data: u8('console.log(1);') },
      { name: 'assets/nested/deep.css', data: u8('body { color: red; }') },
    ]),
  );

  assert.deepStrictEqual(
    [...files.keys()].toSorted(),
    ['assets/app.js', 'assets/nested/deep.css', 'index.html'],
  );
  assert.strictEqual(files.get('index.html')?.toString(), '<html></html>');
});

test('round-trips names longer than the 100 byte ustar name field', async () => {
  const longName = `assets/${'nested/'.repeat(20)}file.js`;
  assert(longName.length > 100);

  const files = await extractWithSystemTar(
    await createTar([{ name: longName, data: u8('deep contents') }]),
  );

  assert.strictEqual(files.get(longName)?.toString(), 'deep contents');
});

test('round-trips a single path component longer than 100 bytes', async () => {
  // Too long for the ustar name field and not splittable across the prefix
  // field, so this can only be represented with an extended header.
  const name = `dir/${'x'.repeat(150)}.js`;

  const files = await extractWithSystemTar(
    await createTar([{ name, data: u8('single long component') }]),
  );

  assert.strictEqual(files.get(name)?.toString(), 'single long component');
});

test('writes non-ASCII names whose byte length exceeds 255', async () => {
  // 200 characters but 600 bytes. Paths are measured in bytes in a tar header,
  // so this only works if the name is carried in a PAX extended header.
  //
  // Asserted on the archive bytes rather than through the system `tar`: no
  // platform we test on can represent this name outside the archive. Linux
  // caps a path component at 255 bytes, Windows `tar -tf` replaces non-ASCII
  // with "?", and Windows normalizes Unicode on the way to disk — all of which
  // would tell us about the platform rather than about what we wrote.
  const name = '日'.repeat(200);
  assert.strictEqual(Buffer.byteLength(name, 'utf8'), 600);

  const tar = await createTar([{ name, data: u8('unicode contents') }]);

  const typeFlag = String.fromCodePoint(tar[156] as number);
  assert.strictEqual(typeFlag, 'x', 'should be a PAX extended header');

  const paxSize = Number.parseInt(
    tar.toString('utf8', 124, 136).replace(/\0.*$/, '').trim(),
    8,
  );
  const paxRecords = tar.toString('utf8', BLOCK_SIZE, BLOCK_SIZE + paxSize);

  assert(
    paxRecords.includes(`path=${name}`),
    'the PAX records should carry the full path',
  );
});

test('round-trips empty files', async () => {
  const files = await extractWithSystemTar(
    await createTar([
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
    await createTar(
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
    await createTar([{ name: 'image.png', data: binary }]),
  );

  assert.deepStrictEqual(
    new Uint8Array(files.get('image.png') as Buffer),
    binary,
  );
});

test('ends with the two zero blocks that mark end of archive', async () => {
  const tar = await createTar([{ name: 'a.txt', data: u8('hi') }]);

  assert.strictEqual(tar.length % BLOCK_SIZE, 0);
  assert.deepStrictEqual(
    tar.subarray(tar.length - BLOCK_SIZE * 2),
    Buffer.alloc(BLOCK_SIZE * 2),
  );
});

test('produces an empty archive for no entries', async () => {
  const tar = await createTar([]);

  assert.strictEqual(tar.length, BLOCK_SIZE * 2);
  assert(tar.every((byte) => byte === 0));
});
