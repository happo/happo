import type { SkipItem } from './types.ts';

/**
 * A pair of Sets used for O(1) skip lookups.
 * - [0]: component-only skips (match all variants of the component)
 * - [1]: component+variant skips (match a specific variant, keyed as "component\0variant")
 */
export type SkipSet = readonly [componentOnly: Set<string>, componentVariant: Set<string>];

function isSkipItem(item: unknown): item is SkipItem {
  if (typeof item !== 'object' || item === null) return false;
  const record = item as Record<string, unknown>;
  const hasComponent = typeof record['component'] === 'string';
  const hasFile = typeof record['file'] === 'string';
  if (hasComponent && hasFile) return false;
  if (hasFile) return record['variant'] === undefined;
  if (hasComponent) return record['variant'] === undefined || typeof record['variant'] === 'string';
  return false;
}

/**
 * Parses and validates a JSON string, returning an array of SkipItems.
 * Throws a TypeError if the JSON is invalid or not an array of SkipItems.
 */
export function validateSkip(json: string): Array<SkipItem> {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || !parsed.every(isSkipItem)) {
    throw new TypeError(
      '--skip must be a JSON array of {component, variant?} or {file} objects',
    );
  }
  return parsed;
}

/**
 * Parses a JSON string into an array of SkipItems. Returns an empty array on
 * any parse error or if the value is not a valid array of SkipItems.
 */
export function parseSkip(json?: string): Array<SkipItem> {
  if (!json) return [];
  try {
    return validateSkip(json);
  } catch {
    return [];
  }
}

/**
 * Converts an array of SkipItems into a SkipSet for efficient lookups.
 * Items with a `file` key (unresolved) are silently ignored.
 */
export function toSkipSet(items: Array<SkipItem>): SkipSet {
  const componentOnly = new Set<string>();
  const componentVariant = new Set<string>();
  for (const item of items) {
    if (!('component' in item)) continue;
    const { component, variant } = item;
    if (variant === undefined) {
      componentOnly.add(component);
    } else {
      componentVariant.add(`${component}\0${variant}`);
    }
  }
  return [componentOnly, componentVariant];
}

/**
 * Returns true if the given component+variant should be skipped according to
 * the SkipSet.
 */
export function isInSkipSet(
  [componentOnly, componentVariant]: SkipSet,
  component: string,
  variant: string,
): boolean {
  return componentOnly.has(component) || componentVariant.has(`${component}\0${variant}`);
}
