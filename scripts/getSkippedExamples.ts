/**
 * Outputs a --skippedExamples JSON argument, cycling through a set of
 * examples based on the current day of the week so that a different example
 * is skipped on each day.
 *
 * Usage:
 *   node scripts/getSkippedExamples.ts
 */

const examples = [
  { component: 'Stories', variant: 'ButtonWithText [white]' },
  { component: 'Stories', variant: 'MiscLarge [white]' },
  { component: 'Stories', variant: 'ButtonFirefoxOnly [white]' },
  { component: 'Stories', variant: 'Portal [white]' },
  { component: 'Stories', variant: 'ButtonWithImage [white]' },
  { component: 'Stories', variant: 'ButtonWithSomeEmoji [white]' },
  { component: 'Stories', variant: 'Lazy [white]' },
];

const day = new Date().getDay(); // 0 (Sun) – 6 (Sat)
const skipped = examples[day % examples.length];

process.stdout.write(JSON.stringify([skipped]));
