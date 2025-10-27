import { afterEach, beforeEach } from 'node:test';

/**
 * Helper for overriding object properties in tests.
 *
 * This helper ensures that the original object is restored after the test.
 *
 * @param objectThunk - A function that returns the object to be overridden.
 * @param overridesThunk - A function that returns the overrides to be applied.
 *
 * @example
 * withOverrides(() => process.env, () => ({ NODE_ENV: 'test' }));
 */
export default function withOverrides(
  objectThunk: () => Record<string, unknown>,
  overridesThunk: () => Record<string, unknown>,
): void {
  const overridesData: Array<{
    objectHadOwn: Record<string, boolean>;
    overridden: Record<string, PropertyDescriptor | undefined>;
    originalObject: Record<string, unknown>;
    overrideEntries: Array<[string, unknown]>;
  }> = [];

  beforeEach(() => {
    const originalObject = objectThunk();
    const overrides = overridesThunk();

    const objectHadOwn: Record<string, boolean> = {};
    const overridden: Record<string, PropertyDescriptor | undefined> = {};

    const overrideEntries = Object.entries(overrides);
    for (const [key, value] of overrideEntries) {
      const hasOwn = Object.hasOwn(originalObject, key);
      objectHadOwn[key] = hasOwn;

      if (hasOwn) {
        overridden[key] = Object.getOwnPropertyDescriptor(originalObject, key);
      }

      const originalDescriptor = overridden[key];

      const enumerable = hasOwn ? (originalDescriptor?.enumerable ?? true) : true;
      const writable = hasOwn ? (originalDescriptor?.writable ?? true) : true;

      Object.defineProperty(originalObject, key, {
        configurable: true,
        enumerable,
        value,
        writable,
      });
    }

    overridesData.push({
      objectHadOwn: objectHadOwn,
      overridden: overridden,
      originalObject: originalObject,
      overrideEntries: overrideEntries,
    });
  });

  afterEach(() => {
    const data = overridesData.pop();

    if (!data) {
      return;
    }

    const { originalObject, overrideEntries, objectHadOwn, overridden } = data;

    for (const [key] of overrideEntries) {
      if (objectHadOwn[key]) {
        const originalDescriptor = overridden[key];
        if (!originalDescriptor) {
          throw new Error(`Original descriptor not found for key ${key}`);
        }

        Object.defineProperty(originalObject, key, originalDescriptor);
      } else {
        delete originalObject[key];
      }
    }
  });
}
