/**
 * Outputs a --partial JSON argument for a storybook partial run, cycling
 * through a set of examples based on the current day of the week so that a
 * different example is skipped on each day.
 *
 * Usage:
 *   node scripts/getPartialExamples.ts
 */

const examples = [
  { component: 'Stories', variant: 'ButtonWithText' },
  { component: 'Stories', variant: 'MiscLarge' },
  { component: 'Stories', variant: 'ButtonFirefoxOnly' },
  { component: 'Stories', variant: 'Portal' },
  { component: 'Stories', variant: 'ButtonWithImage' },
  { component: 'Stories', variant: 'ButtonWithSomeEmoji' },
  { component: 'Stories', variant: 'Lazy' },
];

const day = new Date().getDay(); // 0 (Sun) – 6 (Sat)
const skipped = examples[day % examples.length];

process.stdout.write(JSON.stringify([skipped]));
