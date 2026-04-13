import assert from 'node:assert';
import { describe, it } from 'node:test';

import { isInSkipSet, parseSkip, toSkipSet, validateSkip } from '../parseSkip.ts';

describe('validateSkip', () => {
  it('accepts component items', () => {
    const result = validateSkip(JSON.stringify([{ component: 'Button', variant: 'Primary' }]));
    assert.deepStrictEqual(result, [{ component: 'Button', variant: 'Primary' }]);
  });

  it('accepts component items without variant', () => {
    const result = validateSkip(JSON.stringify([{ component: 'Button' }]));
    assert.deepStrictEqual(result, [{ component: 'Button' }]);
  });

  it('accepts storyFile items', () => {
    const result = validateSkip(
      JSON.stringify([{ storyFile: './src/Button.stories.tsx' }]),
    );
    assert.deepStrictEqual(result, [{ storyFile: './src/Button.stories.tsx' }]);
  });

  it('rejects storyFile items with variant', () => {
    assert.throws(
      () =>
        validateSkip(
          JSON.stringify([{ storyFile: './src/Button.stories.tsx', variant: 'Primary' }]),
        ),
      TypeError,
    );
  });

  it('accepts a mix of component and storyFile items', () => {
    const items = [
      { component: 'Button', variant: 'Primary' },
      { storyFile: './src/Input.stories.tsx' },
    ];
    const result = validateSkip(JSON.stringify(items));
    assert.deepStrictEqual(result, items);
  });

  it('rejects items with both component and storyFile', () => {
    assert.throws(
      () => validateSkip(JSON.stringify([{ component: 'Button', storyFile: './foo.tsx' }])),
      TypeError,
    );
  });

  it('rejects items with neither component nor storyFile', () => {
    assert.throws(
      () => validateSkip(JSON.stringify([{ variant: 'Primary' }])),
      TypeError,
    );
  });

  it('rejects non-array JSON', () => {
    assert.throws(() => validateSkip(JSON.stringify({ component: 'Button' })), TypeError);
  });

  it('throws on invalid JSON', () => {
    assert.throws(() => validateSkip('not json'), SyntaxError);
  });

  it('error message mentions both forms', () => {
    try {
      validateSkip(JSON.stringify([{ invalid: true }]));
      assert.fail('expected an error');
    } catch (e) {
      assert.ok(e instanceof TypeError);
      assert.match(e.message, /storyFile/);
      assert.match(e.message, /component/);
    }
  });
});

describe('parseSkip', () => {
  it('returns empty array when called with no argument', () => {
    assert.deepStrictEqual(parseSkip(), []);
  });

  it('returns empty array for invalid JSON', () => {
    assert.deepStrictEqual(parseSkip('not json'), []);
  });

  it('returns parsed items for valid JSON', () => {
    const items = [
      { component: 'Button' },
      { storyFile: './src/Input.stories.tsx' },
    ];
    assert.deepStrictEqual(parseSkip(JSON.stringify(items)), items);
  });
});

describe('toSkipSet', () => {
  it('builds a skip set from component items', () => {
    const set = toSkipSet([
      { component: 'Button', variant: 'Primary' },
      { component: 'Input' },
    ]);
    assert.ok(isInSkipSet(set, 'Button', 'Primary'));
    assert.ok(isInSkipSet(set, 'Input', 'Default'));
    assert.ok(!isInSkipSet(set, 'Button', 'Secondary'));
  });

  it('ignores storyFile items', () => {
    const set = toSkipSet([{ storyFile: './src/Button.stories.tsx' }]);
    // No component-based entries, so nothing is skipped
    assert.ok(!isInSkipSet(set, 'Button', 'Primary'));
  });

  it('handles a mix of component and storyFile items', () => {
    const set = toSkipSet([
      { component: 'Card' },
      { storyFile: './src/Button.stories.tsx' },
    ]);
    assert.ok(isInSkipSet(set, 'Card', 'Default'));
    assert.ok(!isInSkipSet(set, 'Button', 'Primary'));
  });
});
