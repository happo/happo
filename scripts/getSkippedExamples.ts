/**
 * Outputs a --skippedExamples JSON argument, cycling through a set of
 * examples based on the current day of the week so that a different example
 * is skipped on each day.
 *
 * Usage:
 *   node scripts/getSkippedExamples.ts
 */

const examples = [
  { component: 'Stories', variant: 'Button With Text [white]' },
  { component: 'Stories', variant: 'Misc Large [white]' },
  { component: 'Stories', variant: 'Button Firefox Only [white]' },
  { component: 'Stories', variant: 'Portal [white]' },
  { component: 'Stories', variant: 'Button With Image [white]' },
  { component: 'Stories', variant: 'Button With Some Emoji [white]' },
  { component: 'Stories', variant: 'Lazy [white]' },
];

const day = new Date().getDay(); // 0 (Sun) – 6 (Sat)
const skipped = examples[day % examples.length];

process.stdout.write(JSON.stringify([skipped]));
