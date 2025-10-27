import assert from 'node:assert';
import { describe, it } from 'node:test';

import withOverrides from '../withOverrides.ts';

const someObject = { a: 1, b: 2, c: 3 };

describe('withOverrides', () => {
  describe('when properties are overridden', () => {
    withOverrides(
      () => someObject,
      () => ({ a: 3 }),
    );

    it('overrides properties on the original object', () => {
      assert.deepStrictEqual(someObject, { a: 3, b: 2, c: 3 });
    });

    describe('when more properties are overridden on the same object', () => {
      withOverrides(
        () => someObject,
        () => ({ b: 4 }),
      );

      it('overrides the new properties on the original object without clobbering the previous properties', () => {
        assert.deepStrictEqual(someObject, { a: 3, b: 4, c: 3 });
      });
    });
  });

  describe('when multiple properties are overridden at the same time', () => {
    withOverrides(
      () => someObject,
      () => ({ a: 3, b: 4 }),
    );

    it('overrides the properties on the original object', () => {
      assert.deepStrictEqual(someObject, { a: 3, b: 4, c: 3 });
    });

    describe('when more properties are overridden on the same object', () => {
      withOverrides(
        () => someObject,
        () => ({ c: 5 }),
      );

      it('overrides the new properties on the original object without clobbering the previous properties', () => {
        assert.deepStrictEqual(someObject, { a: 3, b: 4, c: 5 });
      });
    });
  });

  describe('when new properties are added to the object', () => {
    withOverrides(
      () => someObject,
      () => ({ d: 5 }),
    );

    it('adds the new properties to the original object', () => {
      assert.deepStrictEqual(someObject, { a: 1, b: 2, c: 3, d: 5 });
    });
  });

  it('restores the original object after the test', () => {
    assert.deepStrictEqual(someObject, { a: 1, b: 2, c: 3 });
  });
});
