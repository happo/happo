import type { OnlyItem } from './types.ts';

function isOnlyItem(item: unknown): item is OnlyItem {
  if (typeof item !== 'object' || item === null) return false;
  const record = item as Record<string, unknown>;
  const hasComponent = typeof record['component'] === 'string';
  const hasStoryFile = typeof record['storyFile'] === 'string';
  if (hasComponent && hasStoryFile) return false;
  if (hasStoryFile) return record['variant'] === undefined;
  if (hasComponent) return record['variant'] === undefined;
  return false;
}

/**
 * Parses and validates a JSON string, returning an array of OnlyItems.
 * Throws a TypeError if the JSON is invalid or not an array of OnlyItems.
 *
 * Note: `variant` is not supported in `--only` items because variants cannot
 * be resolved statically from the Storybook built files.
 */
export function validateOnly(json: string): Array<OnlyItem> {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || !parsed.every(isOnlyItem)) {
    throw new TypeError(
      '--only must be a JSON array of {component} or {storyFile} objects (variant is not supported)',
    );
  }
  return parsed;
}

/**
 * Parses a JSON string into an array of OnlyItems. Returns an empty array on
 * any parse error or if the value is not a valid array of OnlyItems.
 */
export function parseOnly(json?: string): Array<OnlyItem> {
  if (!json) return [];
  try {
    return validateOnly(json);
  } catch {
    return [];
  }
}
