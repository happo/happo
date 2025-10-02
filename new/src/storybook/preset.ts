export function managerEntries(entry = []) {
  return [...entry, import.meta.resolve('./addon.ts')];
}

export function config(entry = []) {
  return [...entry, import.meta.resolve('./decorator.ts')];
}
