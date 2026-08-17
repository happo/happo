import type { EnvironmentResult } from '../environment/index.ts';

// Happo keeps only the *first line* of this message and caps it at 1000
// characters, so the message has to be a single line — anything after a
// newline is dropped, including newlines inside the error we interpolate. It
// is rendered as plain text, and URLs in it are auto-linked on the job page,
// so the CI job link goes last where it is easy to spot and can't be cut
// short by a long error.
const MAX_ERROR_LENGTH = 120;
const MAX_COMMAND_LENGTH = 80;

export interface FailureMessageOptions {
  /** The integration that was running, e.g. 'playwright' or 'storybook'. */
  integrationType: string;

  /** The command that failed, when the failure came from a spawned command. */
  command?: Array<string> | undefined;

  /** The exit code of the failed command, when it exited on its own. */
  exitCode?: number | undefined;

  /** The error that caused the failure, when we caught one. */
  error?: string | undefined;

  environment: Pick<EnvironmentResult, 'ci' | 'ciJobUrl'>;
}

function toSingleLine(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Describe the failure itself: the command that failed and/or the error we
 * caught. Both are truncated so that a long stack trace or a long command
 * cannot crowd out the rest of the message.
 */
function buildDetail({
  command,
  exitCode,
  error,
}: Pick<FailureMessageOptions, 'command' | 'exitCode' | 'error'>): string {
  const parts: Array<string> = [];

  if (command && command.length > 0) {
    const commandString = truncate(
      toSingleLine(command.join(' ')),
      MAX_COMMAND_LENGTH,
    );
    parts.push(
      exitCode === undefined
        ? `"${commandString}" did not complete`
        : `"${commandString}" exited with code ${exitCode}`,
    );
  } else if (exitCode !== undefined) {
    parts.push(`Exited with code ${exitCode}`);
  }

  const errorText = error ? truncate(toSingleLine(error), MAX_ERROR_LENGTH) : '';
  if (errorText) {
    parts.push(errorText);
  }

  return parts.join(': ');
}

/**
 * Build the message we send to Happo when a job has to be cancelled because
 * something failed locally. This message is often the only thing a developer
 * sees in Happo, so it needs to say what failed and where to look for the
 * details.
 */
export default function formatFailureMessage({
  integrationType,
  command,
  exitCode,
  error,
  environment: { ci, ciJobUrl },
}: FailureMessageOptions): string {
  const capitalizedType = `${integrationType.charAt(0).toUpperCase()}${integrationType.slice(1)}`;
  const detail = buildDetail({ command, exitCode, error });
  const headline = detail
    ? `${capitalizedType} run failed: ${detail}`
    : `${capitalizedType} run failed`;
  const sentence = /[.!?…]$/.test(headline) ? headline : `${headline}.`;

  if (ciJobUrl) {
    return `${sentence} Review the logs from your CI job for the full output: ${ciJobUrl}`;
  }

  return ci
    ? `${sentence} Review the logs from your CI job for the full output.`
    : `${sentence} Review the happo command output in your terminal for the full details.`;
}
