import assert from 'node:assert';
import { describe, it } from 'node:test';

import { parseOnly, validateOnly } from '../parseOnly.ts';

describe('validateOnly', () => {
  it('accepts component items', () => {
    const result = validateOnly(JSON.stringify([{ component: 'Button' }]));
    assert.deepStrictEqual(result, [{ component: 'Button' }]);
  });

  it('rejects component items with variant', () => {
    assert.throws(
      () =>
        validateOnly(
          JSON.stringify([{ component: 'Button', variant: 'Primary' }]),
        ),
      TypeError,
    );
  });

  it('accepts storyFile items', () => {
    const result = validateOnly(
      JSON.stringify([{ storyFile: './src/Button.stories.tsx' }]),
    );
    assert.deepStrictEqual(result, [{ storyFile: './src/Button.stories.tsx' }]);
  });

  it('rejects storyFile items with variant', () => {
    assert.throws(
      () =>
        validateOnly(
          JSON.stringify([{ storyFile: './src/Button.stories.tsx', variant: 'Primary' }]),
        ),
      TypeError,
    );
  });

  it('accepts a mix of component and storyFile items', () => {
    const items = [
      { component: 'Button' },
      { storyFile: './src/Input.stories.tsx' },
    ];
    const result = validateOnly(JSON.stringify(items));
    assert.deepStrictEqual(result, items);
  });

  it('rejects items with both component and storyFile', () => {
    assert.throws(
      () => validateOnly(JSON.stringify([{ component: 'Button', storyFile: './foo.tsx' }])),
      TypeError,
    );
  });

  it('rejects items with neither component nor storyFile', () => {
    assert.throws(
      () => validateOnly(JSON.stringify([{ variant: 'Primary' }])),
      TypeError,
    );
  });

  it('rejects non-array JSON', () => {
    assert.throws(() => validateOnly(JSON.stringify({ component: 'Button' })), TypeError);
  });

  it('throws on invalid JSON', () => {
    assert.throws(() => validateOnly('not json'), SyntaxError);
  });

  it('error message mentions variant not supported', () => {
    try {
      validateOnly(JSON.stringify([{ invalid: true }]));
      assert.fail('expected an error');
    } catch (e) {
      assert.ok(e instanceof TypeError);
      assert.match(e.message, /variant/);
    }
  });
});

describe('parseOnly', () => {
  it('returns empty array when called with no argument', () => {
    assert.deepStrictEqual(parseOnly(), []);
  });

  it('returns empty array for invalid JSON', () => {
    assert.deepStrictEqual(parseOnly('not json'), []);
  });

  it('returns parsed items for valid JSON', () => {
    const items = [
      { component: 'Button' },
      { storyFile: './src/Input.stories.tsx' },
    ];
    assert.deepStrictEqual(parseOnly(JSON.stringify(items)), items);
  });
});
