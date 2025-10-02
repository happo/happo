export function managerEntries(entry = []) {
  return [...entry, import.meta.resolve('./addon')];
}

export function config(entry = []) {
  return [...entry, import.meta.resolve('./decorator')];
}
