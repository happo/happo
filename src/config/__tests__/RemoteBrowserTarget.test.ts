import assert from 'node:assert';
import { describe, it } from 'node:test';

import RemoteBrowserTarget from '../RemoteBrowserTarget.ts';
import type { BrowserType, TargetWithDefaults } from '../index.ts';

const baseTarget: TargetWithDefaults = {
  type: 'chrome',
  viewport: '1024x768',
  __dynamic: false,
};

describe('RemoteBrowserTarget', () => {
  describe('constructor', () => {
    it('throws when browserName is undefined', () => {
      assert.throws(
        () =>
          new RemoteBrowserTarget(
            undefined as unknown as BrowserType,
            baseTarget,
          ),
        /Invalid browser type/,
      );
    });

    it('does not throw for a valid browser type', () => {
      assert.doesNotThrow(
        () => new RemoteBrowserTarget('chrome', baseTarget),
      );
    });
  });
});
