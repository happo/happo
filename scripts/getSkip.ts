/**
 * Outputs a --skip JSON argument with two items, cycling through a set of
 * examples based on the current day of the week so that different examples
 * are skipped on each day.
 *
 * - One item uses the `component` form to skip a specific variant.
 * - One item uses the `file` form to skip all stories in a file.
 *
 * Usage:
 *   node scripts/getSkip.ts
 */

const componentExamples = [
  { component: 'Stories', variant: 'Button With Text [white]' },
  { component: 'Stories', variant: 'Misc Large [white]' },
  { component: 'Stories', variant: 'Button Firefox Only [white]' },
  { component: 'Stories', variant: 'Portal [white]' },
  { component: 'Stories', variant: 'Button With Image [white]' },
  { component: 'Stories', variant: 'Button With Some Emoji [white]' },
  { component: 'Stories', variant: 'Lazy [white]' },
];

const fileExamples = [
  { file: './src/storybook/__tests__/storybook-app/Interactive.stories.ts' },
  { file: './src/storybook/__tests__/storybook-app/Story.stories.ts' },
];

const day = new Date().getDay(); // 0 (Sun) – 6 (Sat)
const componentItem = componentExamples[day % componentExamples.length];
const fileItem = fileExamples[day % fileExamples.length];

process.stdout.write(JSON.stringify([componentItem, fileItem]));
