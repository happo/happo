import type { SkipItem } from './types.ts';

/**
 * A pair of Sets used for O(1) skip lookups.
 * - [0]: component-only skips (match all variants of the component)
 * - [1]: component+variant skips (match a specific variant, keyed as "component\0variant")
 */
export type SkipSet = readonly [componentOnly: Set<string>, componentVariant: Set<string>];

/**
 * Parses a JSON string into an array of SkipItems. Returns an empty array on
 * any parse error or if the value is not a valid array of SkipItems.
 */
export function parseSkippedExamples(json: string | undefined): Array<SkipItem> {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (item): item is SkipItem =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).component === 'string' &&
          ((item as Record<string, unknown>).variant === undefined ||
            typeof (item as Record<string, unknown>).variant === 'string'),
      )
    ) {
      return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

/**
 * Converts an array of SkipItems into a SkipSet for efficient lookups.
 */
export function toSkipSet(items: Array<SkipItem>): SkipSet {
  const componentOnly = new Set<string>();
  const componentVariant = new Set<string>();
  for (const { component, variant } of items) {
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
