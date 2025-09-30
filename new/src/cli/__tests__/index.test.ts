import assert from 'node:assert';
import { afterEach, describe, it, mock } from 'node:test';

import * as tmpfs from '../../test-utils/tmpfs.ts';
import { main } from '../index.ts';

afterEach(() => {
  tmpfs.restore();

  // Silence console.log
  mock.method(console, 'log', () => {});
});

describe('main', () => {
  it('does not reject', async () => {
    assert.doesNotReject(main());
  });

  it('logs', async () => {
    const consoleLog = mock.method(console, 'log', () => {});
    await main();
    assert.ok(consoleLog.mock.callCount() > 0);
  });
});
