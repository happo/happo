import assert from 'node:assert';
import { describe, it } from 'node:test';

import findClosestMatch from '../findClosestMatch.ts';

describe('findClosestMatch', () => {
  it('returns the closest candidate for a likely typo', () => {
    assert.strictEqual(
      findClosestMatch('viewPort', ['type', 'viewport', 'maxHeight']),
      'viewport',
    );
    assert.strictEqual(
      findClosestMatch('confgDir', ['configDir', 'staticDir']),
      'configDir',
    );
  });

  it('returns undefined when nothing is close enough', () => {
    assert.strictEqual(
      findClosestMatch('stylesheets', ['targets', 'project']),
      undefined,
    );
    assert.strictEqual(findClosestMatch('foo', ['fps']), undefined);
  });

  it('returns undefined when there are no candidates', () => {
    assert.strictEqual(findClosestMatch('anything', []), undefined);
  });
});
