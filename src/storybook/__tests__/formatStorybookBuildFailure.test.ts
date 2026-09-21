import assert from 'node:assert';
import { describe, it } from 'node:test';

import formatFailureMessage from '../../network/formatFailureMessage.ts';
import formatStorybookBuildFailure, {
  extractFailureReason,
  stripAnsi,
} from '../formatStorybookBuildFailure.ts';

const COMMAND = ['storybook', 'build', '--output-dir', '.out'];

/**
 * What Happo ends up showing on the job page. The value of a better error is
 * entirely in what survives this, so the assertions below go through it
 * rather than trusting the raw message.
 */
function asJobPageMessage(error: string): string {
  return formatFailureMessage({
    integrationType: 'storybook',
    error,
    environment: { ci: true, ciJobUrl: 'https://ci.example.com/job/1' },
  });
}

describe('formatStorybookBuildFailure', () => {
  it('leads with the exit code', () => {
    const message = formatStorybookBuildFailure({
      command: COMMAND,
      exitCode: 1,
      output: 'Module not found: ./Button',
    });

    assert.match(message.split('\n')[0] ?? '', /exited with code 1\./);
  });

  it('names an out-of-memory kill by exit code', () => {
    const message = formatStorybookBuildFailure({
      command: COMMAND,
      exitCode: 137,
    });

    assert.match(message, /ran out of memory/);
    assert.match(message, /max-old-space-size/);
  });

  it('names an out-of-memory kill by signal', () => {
    const message = formatStorybookBuildFailure({
      command: COMMAND,
      exitCode: null,
      signal: 'SIGKILL',
    });

    assert.match(message, /ran out of memory/);
  });

  it('reports other signals without guessing at memory', () => {
    const message = formatStorybookBuildFailure({
      command: COMMAND,
      exitCode: null,
      signal: 'SIGTERM',
    });

    assert.match(message, /terminated by SIGTERM/);
    assert.doesNotMatch(message, /memory/);
  });

  it('replays the captured output', () => {
    const message = formatStorybookBuildFailure({
      command: COMMAND,
      exitCode: 1,
      output: 'building...\nERR! Failed to resolve import "./missing"\n',
    });

    assert.match(message, /Failed to resolve import "\.\/missing"/);
  });

  it('keeps only the tail of a long build log', () => {
    const output = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const message = formatStorybookBuildFailure({
      command: COMMAND,
      exitCode: 1,
      output,
    });

    assert.match(message, /line 199/);
    assert.doesNotMatch(message, /line 0\b/);
  });

  it('strips ANSI escapes so the message stays readable off a terminal', () => {
    const message = formatStorybookBuildFailure({
      command: COMMAND,
      exitCode: 1,
      output: '\u001B[31mERR! it broke\u001B[39m',
    });

    assert.match(message, /ERR! it broke/);
    assert.ok(!message.includes(String.fromCodePoint(27)));
  });

  it('says so when there was no output at all', () => {
    const message = formatStorybookBuildFailure({
      command: COMMAND,
      exitCode: 1,
      output: '   \n\n  ',
    });

    assert.match(message, /produced no output/);
  });

  it('includes the command that was run', () => {
    const message = formatStorybookBuildFailure({
      command: COMMAND,
      exitCode: 1,
    });

    assert.match(message, /storybook build --output-dir \.out/);
  });

  describe('once Happo has truncated it for the job page', () => {
    it('keeps the out-of-memory diagnosis', () => {
      const message = asJobPageMessage(
        formatStorybookBuildFailure({
          command: COMMAND,
          exitCode: 137,
          output: 'building...',
        }),
      );

      assert.match(message, /killed before it finished/);
      assert.match(message, /ran out of memory/);
    });

    it('keeps the exit code when the output explains nothing', () => {
      const message = asJobPageMessage(
        formatStorybookBuildFailure({
          command: COMMAND,
          exitCode: 2,
          output: Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n'),
        }),
      );

      assert.match(message, /exited with code 2/);
    });

    it("keeps Storybook's own reason, which is the whole point", () => {
      const message = asJobPageMessage(
        formatStorybookBuildFailure({
          command: COMMAND,
          exitCode: 1,
          output: [
            ...Array.from({ length: 200 }, (_, i) => `noise line ${i}`),
            'SB_CORE-SERVER_0006 (MainFileMissingError): No configuration files have been found in your configDir: /app/.storybook.',
            '  at validateConfigurationFiles (file://.../chunk.js:13132:11)',
          ].join('\n'),
        }),
      );

      assert.match(message, /MainFileMissingError/);
      assert.match(message, /https:\/\/ci\.example\.com\/job\/1/);
    });
  });
});

describe('extractFailureReason', () => {
  it("prefers Storybook's own structured error line", () => {
    const reason = extractFailureReason(
      [
        '  at buildStaticStandalone (file://.../core-server/index.js:7536:16)',
        '  at async withTelemetry (file://.../chunk-FTP3QZ7O.js:142:12)',
        'SB_CORE-SERVER_0006 (MainFileMissingError): No configuration files have been found in your configDir: /app/.storybook.',
        '  at validateConfigurationFiles (file://.../chunk-IQHYYTFR.js:13132:11)',
      ].join('\n'),
    );

    assert.match(reason ?? '', /^SB_CORE-SERVER_0006 \(MainFileMissingError\)/);
  });

  it('falls back to a builder error line when Storybook has no code for it', () => {
    const reason = extractFailureReason(
      ['transforming...', 'Error: Failed to resolve import "./missing"'].join('\n'),
    );

    assert.strictEqual(reason, 'Error: Failed to resolve import "./missing"');
  });

  it('never picks a stack frame', () => {
    const reason = extractFailureReason(
      ['  at Object.<anonymous> (/app/x.js:1:1)', '  at Module._compile'].join('\n'),
    );

    assert.strictEqual(reason, undefined);
  });

  it('returns undefined when nothing looks like an error', () => {
    assert.strictEqual(extractFailureReason('building...\ndone\n'), undefined);
  });

  it('truncates a very long reason', () => {
    const reason = extractFailureReason(`Error: ${'x'.repeat(500)}`);

    assert.ok(reason);
    assert.ok(reason.length <= 100, `expected <= 100 chars, got ${reason.length}`);
    assert.match(reason, /…$/);
  });
});

describe('stripAnsi', () => {
  it('leaves plain text alone', () => {
    assert.strictEqual(stripAnsi('plain text'), 'plain text');
  });

  it('removes color and cursor sequences', () => {
    assert.strictEqual(stripAnsi('\u001B[2K\u001B[1Gdone\u001B[0m'), 'done');
  });
});
