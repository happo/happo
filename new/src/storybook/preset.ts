export function managerEntries(entry: Array<string> = []): Array<string> {
  return [...entry, import.meta.resolve('./browser/addon.ts')];
}

export function config(entry: Array<string> = []): Array<string> {
  return [...entry, import.meta.resolve('./browser/decorator.ts')];
}
