import path from 'node:path';

// Support both CJS (Storybook v9) and ESM (Storybook v10)
const dirname = typeof __dirname === 'undefined' ? import.meta.dirname : __dirname;

export function managerEntries(entry: Array<string> = []): Array<string> {
  return [...entry, path.resolve(dirname, './browser/addon.js')];
}

export function config(entry: Array<string> = []): Array<string> {
  return [...entry, path.resolve(dirname, './browser/decorator.js')];
}
