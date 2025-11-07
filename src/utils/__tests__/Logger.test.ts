import assert from 'node:assert';
import type { Mock } from 'node:test';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import Logger, { logTag } from '../Logger.ts';

let subject: () => Logger;
let stderrPrint: Mock<(str: string) => void>;
let print: Mock<(str: string) => void>;
let originalDateNow: typeof Date.now;
let currentTime: number;

function getCleanLogs(mockedFn: Mock<(str: string) => void>) {
  return (
    mockedFn.mock.calls
      .map((call) => call.arguments[0])
      .join('')
      // eslint-disable-next-line no-control-regex
      .replaceAll(/\u001B\[\d{1,2}m/g, '')
  );
}

beforeEach(() => {
  stderrPrint = mock.fn();
  print = mock.fn();
  subject = () => new Logger({ print, stderrPrint });

  // Mock Date.now() for timer tests
  currentTime = 1000;
  originalDateNow = Date.now;
  Date.now = () => currentTime;
});

afterEach(() => {
  // Restore Date.now()
  if (originalDateNow) {
    Date.now = originalDateNow;
  }
});

describe('Logger', () => {
  it('works without injected printers', () => {
    // This test is here just to make sure that the dependency injection of the
    // `print` and `stderrPrint` functions isn't causing any issues
    const error = new Error('Ignore this log');
    delete error.stack;
    new Logger().error(error);
    new Logger().info('Ignore this log');
  });

  it('does not print to stdout on errors', () => {
    subject().error(new Error('foo'));
    assert.strictEqual(print.mock.calls.length, 0);
  });

  it('prints to stderr on errors', () => {
    subject().error(new Error('foo'));
    assert.strictEqual(stderrPrint.mock.calls.length, 2);
  });

  it('logs errors with stacks', () => {
    const error = new Error('damn');
    error.stack = 'foobar';
    subject().error(error);
    // We use `stringContaining` here because the string is wrapped with color
    // instruction characters
    assert.ok(
      stderrPrint.mock.calls[0]?.arguments[0]?.includes('foobar'),
      'Expected error log to contain stack trace',
    );
  });

  it('logs errors without stacks', () => {
    const error = new Error('damn');
    delete error.stack;
    subject().error(error);
    // We use `stringContaining` here because the string is wrapped with color
    // instruction characters
    assert.ok(
      stderrPrint.mock.calls[0]?.arguments[0]?.includes('damn'),
      'Expected error log to contain error message',
    );
  });

  it('logs "Starting: msg" with start(msg)', () => {
    const logger = subject();

    logger.start('Pizza');
    assert.ok(
      print.mock.calls[0]?.arguments[0]?.includes('Starting: Pizza'),
      'Expected log to contain "Starting: Pizza"',
    );
  });

  it('logs nothing with start()', () => {
    const logger = subject();

    logger.start();
    assert.strictEqual(print.mock.calls.length, 0);
  });

  it('logs start message with success()', () => {
    const logger = subject();

    logger.start('Pizza');
    print.mock.resetCalls();

    logger.success('Yum');
    assert.ok(
      print.mock.calls[0]?.arguments[0]?.includes('✓'),
      'Expected log to contain checkmark',
    );
    assert.ok(
      print.mock.calls[1]?.arguments[0]?.includes('Pizza:'),
      'Expected log to contain "Pizza:"',
    );
  });

  it('handles no start message with success()', () => {
    const logger = subject();

    logger.start();
    print.mock.resetCalls();

    logger.success('Yum');
    assert.ok(
      print.mock.calls[0]?.arguments[0]?.includes('✓'),
      'Expected log to contain checkmark',
    );
  });

  it('logs durations with start() and success()', () => {
    const logger = subject();

    logger.start('Pizza');
    assert.ok(
      print.mock.calls[0]?.arguments[0]?.includes('Starting: Pizza'),
      'Expected log to contain "Starting: Pizza"',
    );
    assert.strictEqual(stderrPrint.mock.calls.length, 0);
    print.mock.resetCalls();

    currentTime += 12;

    logger.success('Yum');
    assert.ok(
      print.mock.calls[2]?.arguments[0]?.includes('Yum'),
      'Expected log to contain "Yum"',
    );
    assert.ok(
      /\(\d+ms\)/.test(print.mock.calls[3]?.arguments[0] || ''),
      'Expected log to contain duration in milliseconds',
    );
    assert.strictEqual(stderrPrint.mock.calls.length, 0);

    const cleanLogs = getCleanLogs(print);
    assert.strictEqual(cleanLogs, '✓ Pizza: Yum (12ms)\n');
  });

  it('logs durations with start() and fail()', () => {
    const logger = subject();

    logger.start('Pizza');
    assert.ok(
      print.mock.calls[0]?.arguments[0]?.includes('Starting: Pizza'),
      'Expected log to contain "Starting: Pizza"',
    );
    assert.strictEqual(stderrPrint.mock.calls.length, 0);
    print.mock.resetCalls();

    currentTime += 13;

    logger.fail('Yuck');
    assert.ok(
      print.mock.calls[2]?.arguments[0]?.includes('Yuck'),
      'Expected log to contain "Yuck"',
    );
    assert.ok(
      /\(\d+ms\)/.test(print.mock.calls[3]?.arguments[0] || ''),
      'Expected log to contain duration in milliseconds',
    );
    assert.strictEqual(stderrPrint.mock.calls.length, 0);

    const cleanLogs = getCleanLogs(print);
    assert.strictEqual(cleanLogs, '✗ Pizza: Yuck (13ms)\n');
  });

  it('logs start message with fail()', () => {
    const logger = subject();

    logger.start('Pizza');
    print.mock.resetCalls();

    logger.fail('Yuck');
    assert.ok(
      print.mock.calls[0]?.arguments[0]?.includes('✗'),
      'Expected log to contain X mark',
    );
    assert.ok(
      print.mock.calls[1]?.arguments[0]?.includes(' Pizza:'),
      'Expected log to contain " Pizza:"',
    );
  });
});

describe('logTag()', () => {
  it('is empty with no project', () => {
    assert.strictEqual(logTag(), '');
    assert.strictEqual(logTag(''), '');
  });

  it('is [project] with a project', () => {
    assert.strictEqual(logTag('pizza'), '[pizza] ');
  });
});
