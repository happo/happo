import assert from 'node:assert';
import { describe, it } from 'node:test';

import formatFailureMessage from '../formatFailureMessage.ts';

const localEnvironment = { ci: false, ciJobUrl: undefined };
const ciEnvironment = { ci: true, ciJobUrl: undefined };

describe('formatFailureMessage', () => {
  it('explains what failed and where to look', () => {
    const message = formatFailureMessage({
      integrationType: 'playwright',
      command: ['npx', 'playwright', 'test'],
      exitCode: 1,
      environment: {
        ci: true,
        ciJobUrl: 'https://github.com/happo/happo/actions/runs/123',
      },
    });

    assert.strictEqual(
      message,
      'Playwright run failed: "npx playwright test" exited with code 1. Review the logs from your CI job for the full output: https://github.com/happo/happo/actions/runs/123',
    );
  });

  it('includes the error when there is one', () => {
    const message = formatFailureMessage({
      integrationType: 'storybook',
      error: 'Failed to finalize assets',
      environment: ciEnvironment,
    });

    assert.strictEqual(
      message,
      'Storybook run failed: Failed to finalize assets. Review the logs from your CI job for the full output.',
    );
  });

  it('points at the terminal when not running in CI', () => {
    const message = formatFailureMessage({
      integrationType: 'cypress',
      environment: localEnvironment,
    });

    assert.strictEqual(
      message,
      'Cypress run failed. Review the happo command output in your terminal for the full details.',
    );
  });

  it('says the command did not complete when it was killed by a signal', () => {
    const message = formatFailureMessage({
      integrationType: 'cypress',
      command: ['yarn', 'cypress', 'run'],
      exitCode: undefined,
      environment: ciEnvironment,
    });

    assert.match(message, /"yarn cypress run" did not complete\./);
    assert.doesNotMatch(message, /exited with code/);
  });

  // Happo drops everything after the first newline, so a multi-line error must
  // not be able to swallow the rest of the message.
  it('is always a single line', () => {
    const message = formatFailureMessage({
      integrationType: 'storybook',
      error: 'Failed to build\n  at doThing (thing.js:1:1)\n  at other (o.js:2:2)',
      environment: ciEnvironment,
    });

    assert.doesNotMatch(message, /[\r\n]/);
    assert.strictEqual(
      message,
      'Storybook run failed: Failed to build at doThing (thing.js:1:1) at other (o.js:2:2). Review the logs from your CI job for the full output.',
    );
  });

  it('truncates long errors and commands', () => {
    const message = formatFailureMessage({
      integrationType: 'storybook',
      command: ['npx', 'some-very-long-command'.repeat(10)],
      error: 'a'.repeat(600),
      environment: ciEnvironment,
    });

    assert.match(message, /"npx some-very-long-command.{0,60}…" did not complete/);
    // The ellipsis stands in for the sentence-ending period.
    assert.match(message, /: a{119}… Review/);
  });

  it('keeps the whole CI job url, however long the failure details are', () => {
    const ciJobUrl =
      'https://github.enterprise.acme-corporation.com/platform-team/frontend-monorepo/actions/runs/12345678901/attempts/2';
    const message = formatFailureMessage({
      integrationType: 'playwright',
      command: ['npx', 'playwright', 'test'],
      exitCode: 1,
      error: 'a'.repeat(600),
      environment: { ci: true, ciJobUrl },
    });

    assert.ok(message.endsWith(ciJobUrl), `url was cut short: ${message}`);
  });

  it('does not add a second period when the error ends with one', () => {
    const message = formatFailureMessage({
      integrationType: 'storybook',
      error: 'Something went wrong.',
      environment: ciEnvironment,
    });

    assert.match(message, /Something went wrong\. Review/);
  });

  it('ignores empty errors and commands', () => {
    const message = formatFailureMessage({
      integrationType: 'storybook',
      error: '   ',
      command: [],
      environment: ciEnvironment,
    });

    assert.strictEqual(
      message,
      'Storybook run failed. Review the logs from your CI job for the full output.',
    );
  });
});
