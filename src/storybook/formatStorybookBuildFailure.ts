import { stripVTControlCharacters } from 'node:util';

/**
 * How much of Storybook's own build output we keep around to replay when the
 * build fails. The output is streamed straight through to the terminal as it
 * arrives either way -- this is only the tail that travels *with* the error,
 * so the reason reaches places the live output never does: the Happo job
 * page, and anyone reading a log where the build output scrolled past long
 * before the failure was reported.
 */
export const MAX_CAPTURED_OUTPUT_CHARS = 20_000;

/** Lines of that tail we actually put in the message. */
const MAX_REPLAYED_LINES = 30;

export interface StorybookBuildFailure {
  /** The command we spawned, binary first. */
  command: Array<string>;

  /** Exit code, when the process exited on its own. */
  exitCode?: number | null | undefined;

  /** Signal that killed the process, when it did not exit on its own. */
  signal?: NodeJS.Signals | null | undefined;

  /** Whatever we captured of the build's combined stdout/stderr. */
  output?: string | undefined;
}

/**
 * Storybook reports its own failures with a structured code, as in
 * `SB_CORE-SERVER_0006 (MainFileMissingError): No configuration files have
 * been found...`. When one of those is in the output it is by far the best
 * single line we have, so it is worth pulling out and putting where only one
 * line fits.
 */
const STORYBOOK_ERROR_LINE = /^\s*(SB_[A-Z0-9_-]+ \([^)]*\): .+)$/m;

/**
 * Weaker fallback for builders that fail on their own terms (Vite, webpack, a
 * failing `tsc`) without going through Storybook's error classes. Stack frames
 * are excluded: `at Object.<anonymous> (...)` is never the useful line.
 */
const GENERIC_ERROR_LINE = /^\s*(?!at )(?:ERR!\s*)?((?:\w*Error|error):? .+)$/m;

const MAX_REASON_LENGTH = 100;

/**
 * Best guess at the one line from the build output that explains the failure.
 */
export function extractFailureReason(output: string): string | undefined {
  const plain = stripVTControlCharacters(output);
  const match =
    STORYBOOK_ERROR_LINE.exec(plain) ?? GENERIC_ERROR_LINE.exec(plain);
  const reason = match?.[1]?.trim();

  if (!reason) {
    return undefined;
  }

  return reason.length > MAX_REASON_LENGTH
    ? `${reason.slice(0, MAX_REASON_LENGTH - 1).trimEnd()}…`
    : reason;
}

/**
 * The one-line summary. This is the part that survives: `formatFailureMessage`
 * collapses the message to a single line and truncates it to 120 characters
 * before sending it to Happo, so what matters most has to come first, and it
 * has to be short.
 *
 * Both callers prefix this with "Storybook run failed: ", so it is written to
 * read as the continuation of that sentence rather than to stand alone.
 */
function buildHeadline({
  exitCode,
  signal,
  output,
}: Pick<StorybookBuildFailure, 'exitCode' | 'signal' | 'output'>): string {
  // A SIGKILL with no exit code and a 137 exit code are the same event seen
  // from two places: the kernel's OOM killer, or a CI runner enforcing a
  // memory cap. Storybook builds are memory-hungry enough that this is the
  // most common way they fail on a CI machine but not on a laptop.
  if (signal === 'SIGKILL' || exitCode === 137) {
    return (
      'The Storybook build was killed before it finished, which usually means it ran out of memory. ' +
      'Try giving it more memory (NODE_OPTIONS=--max-old-space-size=4096) or a larger CI machine.'
    );
  }

  if (signal) {
    return `The Storybook build was terminated by ${signal} before it finished.`;
  }

  // Everything else is an ordinary build failure, where the exit code alone
  // says nothing useful. Storybook's own reason for stopping is the thing
  // worth spending the single line on.
  const reason = extractFailureReason(output ?? '');

  if (typeof exitCode === 'number') {
    return reason ?? `The Storybook build exited with code ${exitCode}.`;
  }

  return reason ?? 'The Storybook build did not complete.';
}

/**
 * Build the error we throw when `storybook build` fails.
 *
 * The first line is the summary Happo shows on the job page. Everything after
 * it is for the terminal, where there is room for the command we ran and for
 * Storybook's own last words about why it gave up.
 */
export default function formatStorybookBuildFailure({
  command,
  exitCode,
  signal,
  output,
}: StorybookBuildFailure): string {
  const sections = [buildHeadline({ exitCode, signal, output })];

  const tail = stripVTControlCharacters(output ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
    .slice(-MAX_REPLAYED_LINES);

  sections.push(
    tail.length > 0
      ? `Storybook printed this before it stopped:\n${tail.map((line) => `  ${line}`).join('\n')}`
      : // No output at all is itself a clue: it points at the command never
        // really running, rather than at the build failing partway through.
        'Storybook produced no output before it stopped.',
  );

  const exitDescription = signal
    ? `terminated by ${signal}`
    : `exit code ${exitCode}`;
  sections.push(
    `The command Happo ran was (${exitDescription}):\n  ${command.join(' ')}`,
  );

  return sections.join('\n\n');
}
