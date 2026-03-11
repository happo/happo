#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const rootDir = path.resolve(import.meta.dirname, '..');

  const dirsToRemove = [
    path.resolve(rootDir, 'dist'),
    path.resolve(rootDir, 'tmp', 'tsc'),
    path.resolve(rootDir, 'tmp', 'happo-custom'),
  ];

  await Promise.all(
    dirsToRemove.map((dir) => fs.promises.rm(dir, { recursive: true, force: true })),
  );
}

if (import.meta.main) {
  await main();
}

