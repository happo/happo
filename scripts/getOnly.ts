/**
 * Outputs an --only JSON argument with two items, cycling through a set of
 * examples based on the current day of the week so that different examples
 * are included on each day.
 *
 * - One item uses the `component` form to include all variants of a component.
 * - One item uses the `storyFile` form to include all stories in a file.
 *
 * Usage:
 *   node scripts/getOnly.ts
 */

const componentExamples = [
  { component: 'Stories' },
  { component: 'Interactive' },
];

const storyFileExamples = [
  { storyFile: './src/storybook/__tests__/storybook-app/Interactive.stories.ts' },
  { storyFile: './src/storybook/__tests__/storybook-app/Story.stories.ts' },
];

const day = new Date().getDay(); // 0 (Sun) – 6 (Sat)
const componentItem = componentExamples[day % componentExamples.length];
const storyFileItem = storyFileExamples[day % storyFileExamples.length];

process.stdout.write(JSON.stringify([componentItem, storyFileItem]));
