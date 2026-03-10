import fs from 'node:fs';
import path from 'node:path';

interface StorybookIndexEntry {
  type: string;
}

interface StorybookIndex {
  entries?: Record<string, StorybookIndexEntry>;
  stories?: Record<string, StorybookIndexEntry>;
}

/**
 * Reads the storybook index.json from the given package directory and returns
 * the total number of story entries (excluding docs and other non-story types).
 * Returns undefined if the file cannot be read or parsed.
 */
export default async function getStorybookStoryCount(
  packageDir: string,
): Promise<number | undefined> {
  const indexPath = path.join(packageDir, 'index.json');
  try {
    const content = await fs.promises.readFile(indexPath, 'utf8');
    const data = JSON.parse(content) as StorybookIndex;
    const entries = data.entries ?? data.stories ?? {};
    return Object.values(entries).filter((e) => e.type === 'story').length;
  } catch (error) {
    console.warn('Failed to get estimated snaps count from Storybook:', error);
    return undefined;
  }
}
