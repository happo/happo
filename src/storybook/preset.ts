import path from 'node:path';

import getStorybookVersionFromPackageJson from './getStorybookVersionFromPackageJson.ts';

// Support both CJS (Storybook v9) and ESM (Storybook v10)
const dirname = typeof __dirname === 'undefined' ? import.meta.dirname : __dirname;

export function managerEntries(entry: Array<string> = []): Array<string> {
  // Storybook v8 exposes manager APIs via 'storybook/internal/manager-api';
  // v9 and v10 use 'storybook/manager-api'. The two addon bundles import from
  // the appropriate path so we select the right one here.
  const version = getStorybookVersionFromPackageJson();
  const addonFile = version < 9 ? './browser/addon-v8.js' : './browser/addon.js';
  return [...entry, path.resolve(dirname, addonFile)];
}

export function config(entry: Array<string> = []): Array<string> {
  return [...entry, path.resolve(dirname, './browser/decorator.js')];
}
