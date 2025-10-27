import path from 'node:path';

export function managerEntries(entry: Array<string> = []): Array<string> {
  return [...entry, path.resolve(__dirname, './browser/addon.js')];
}

export function config(entry: Array<string> = []): Array<string> {
  return [...entry, path.resolve(__dirname, './browser/decorator.js')];
}
