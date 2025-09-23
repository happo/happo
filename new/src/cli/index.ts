#!/usr/bin/env node

import { any as findAny } from 'empathic/find';

const CONFIG_FILENAMES = [
  'happo.config.js',
  'happo.config.mjs',
  'happo.config.cjs',
  'happo.config.ts',
  'happo.config.mts',
  'happo.config.cts',
];

export function findConfigFile(): string | undefined {
  const configFilePath = findAny(CONFIG_FILENAMES, { cwd: process.cwd() });

  if (!configFilePath) {
    throw new Error(
      'Happo config file could not be found. Please create a config file in the root of your project.',
    );
  }

  return configFilePath;
}

console.log(findConfigFile());
