/**
 * Outputs an --only JSON argument with a single storyFile item, cycling
 * through the available story files based on the current day of the week.
 *
 * Usage:
 *   node scripts/getOnly.ts
 */

const storyFileExamples = [
  { storyFile: './src/storybook/__tests__/storybook-app/Interactive.stories.ts' },
  { storyFile: './src/storybook/__tests__/storybook-app/Story.stories.ts' },
];

const day = new Date().getDay(); // 0 (Sun) – 6 (Sat)
const storyFileItem = storyFileExamples[day % storyFileExamples.length];

process.stdout.write(JSON.stringify([storyFileItem]));
