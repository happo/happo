import path from 'node:path';

import type { SkipItem } from '../isomorphic/types.ts';

export interface StorybookIndexEntry {
  type: string;
  importPath?: string;
  title?: string;
  name?: string;
}

/**
 * Resolves `file` skip items to component-based skip items using the
 * Storybook `index.json` entries. Items that already have a `component` are
 * passed through unchanged.
 *
 * Path matching is done by normalising both the `importPath` from the index
 * and the user-supplied `file` (stripping a leading `./`), with an
 * absolute-path fallback via `path.resolve`.
 */
export default function resolveStoryFileItems(
  skip: Array<SkipItem>,
  entries: Record<string, StorybookIndexEntry>,
): Array<{ component: string; variant?: string }> {
  const fileToComponents = new Map<string, Set<string>>();
  for (const entry of Object.values(entries)) {
    if (!entry.importPath || !entry.title) continue;
    const normalized = normalizeImportPath(entry.importPath);
    let set = fileToComponents.get(normalized);
    if (!set) {
      set = new Set();
      fileToComponents.set(normalized, set);
    }
    set.add(entry.title);
  }

  const resolved: Array<{ component: string; variant?: string }> = [];

  for (const item of skip) {
    if ('component' in item) {
      resolved.push(item);
      continue;
    }

    const normalizedFile = normalizeImportPath(item.file);
    let components = fileToComponents.get(normalizedFile);

    if (!components) {
      // Fall back to absolute path comparison
      const resolvedFile = path.resolve(item.file);
      for (const [normalizedImport, titles] of fileToComponents) {
        if (path.resolve(normalizedImport) === resolvedFile) {
          components = titles;
          break;
        }
      }
    }

    if (components) {
      for (const component of components) {
        resolved.push({ component });
      }
    } else {
      console.warn(
        `[HAPPO] Could not find any stories for file '${item.file}' in the Storybook index`,
      );
    }
  }

  return resolved;
}

function normalizeImportPath(p: string): string {
  return p.startsWith('./') ? p.slice(2) : p;
}
