import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { WindowWithHappo } from '../../isomorphic/types.ts';
import type { WindowHappo } from '../../isomorphic/types.ts';
import happoStatic from '../index.ts';

interface WindowWithHappoRequired extends WindowWithHappo {
  happo: WindowHappo;
}

interface HappoStatic extends WindowHappo {
  init: Required<WindowHappo>['init'];
  nextExample: Required<WindowHappo>['nextExample'];
}

function assertWindowHasHappo(
  win: WindowWithHappo,
): asserts win is WindowWithHappoRequired {
  if (!win.happo) {
    throw new Error('window.happo is not defined');
  }
  if (typeof win.happo !== 'object') {
    throw new TypeError('window.happo is not an object');
  }
}

function assertHappoStaticIsInitialized(
  happo: WindowHappo,
): asserts happo is HappoStatic {
  if (!happo.init) {
    throw new TypeError('happo.init is not defined');
  }
  if (typeof happo.init !== 'function') {
    throw new TypeError('happo.init is not a function');
  }

  if (!happo.nextExample) {
    throw new TypeError('happo.nextExample is not defined');
  }
  if (typeof happo.nextExample !== 'function') {
    throw new TypeError('happo.nextExample is not a function');
  }
}

let win: WindowWithHappo;
beforeEach(() => {
  win = {} as Window;
});

afterEach(() => {
  happoStatic.reset();
});

it('#init sets up some globals', () => {
  happoStatic.init(win);
  assert.strictEqual(typeof win.happo?.nextExample, 'function');
  assert.strictEqual(typeof win.happo?.init, 'function');
});

describe('when happo.init is called with only option', () => {
  it('filters examples to only the single one', async () => {
    happoStatic.init(win);
    happoStatic.registerExample({
      component: 'Hello',
      variant: 'red',
      render: async () => {
        console.log('Hello red');
      },
    });

    happoStatic.registerExample({
      component: 'Hello',
      variant: 'blue',
      render: async () => {
        console.log('Hello blue');
      },
    });

    assertWindowHasHappo(win);
    assertHappoStaticIsInitialized(win.happo);
    win.happo.init({
      targetName: 'test',
      only: { component: 'Hello', variant: 'blue' },
    });
    const example = await win.happo.nextExample();
    assert.strictEqual(example?.component, 'Hello');
    assert.strictEqual(example?.variant, 'blue');
    const nextExample = await win.happo.nextExample();
    assert.strictEqual(nextExample, undefined);
  });
});

describe('when happo.init is called with chunk option', () => {
  it('filters examples to the right ones', async () => {
    happoStatic.init(win);
    happoStatic.registerExample({
      component: 'Hello',
      variant: 'red',
      render: async () => {
        console.log('Hello red');
      },
    });

    happoStatic.registerExample({
      component: 'Hello',
      variant: 'blue',
      render: async () => {
        console.log('Hello blue');
      },
    });

    happoStatic.registerExample({
      component: 'Hello',
      variant: 'green',
      render: async () => {
        console.log('Hello green');
      },
    });

    assertWindowHasHappo(win);
    assertHappoStaticIsInitialized(win.happo);
    win.happo.init({ targetName: 'test', chunk: { total: 3, index: 2 } });
    const example = await win.happo.nextExample();
    assert.strictEqual(example?.component, 'Hello');
    assert.strictEqual(example?.variant, 'green');
    const nextExample = await win.happo.nextExample();
    assert.strictEqual(nextExample, undefined);
  });
});

it('can iterate over registered examples', async () => {
  happoStatic.init(win);
  happoStatic.registerExample({
    component: 'Foo',
    variant: 'default',
    render: () => {},
  });
  happoStatic.registerExample({
    component: 'Foo',
    variant: 'bar',
    render: () => {},
  });

  assertWindowHasHappo(win);
  assertHappoStaticIsInitialized(win.happo);
  const example = await win.happo.nextExample();
  assert.strictEqual(example?.component, 'Foo');
  assert.strictEqual(example?.variant, 'default');
  const nextExample = await win.happo.nextExample();
  assert.strictEqual(nextExample?.component, 'Foo');
  assert.strictEqual(nextExample?.variant, 'bar');
  const nextExample2 = await win.happo.nextExample();
  assert.strictEqual(nextExample2, undefined);
});

it('passes along properties from the example', async () => {
  happoStatic.init(win);
  happoStatic.registerExample({
    component: 'Foo',
    variant: 'default',
    waitForContent: 'what?',
    render: () => {},
  });
  assertWindowHasHappo(win);
  assertHappoStaticIsInitialized(win.happo);
  const example = await win.happo.nextExample();
  assert.strictEqual(example?.component, 'Foo');
  assert.strictEqual(example?.variant, 'default');
  assert.strictEqual(example?.waitForContent, 'what?');
  const nextExample = await win.happo.nextExample();
  assert.strictEqual(nextExample, undefined);
});

describe('when __HAPPO_FAIL_ON_STORY_ERROR is true', () => {
  beforeEach(() => {
    globalThis.__HAPPO_FAIL_ON_STORY_ERROR = true;
  });

  afterEach(() => {
    globalThis.__HAPPO_FAIL_ON_STORY_ERROR = undefined;
  });

  it('collects errors and throws AggregateError at the end', async () => {
    happoStatic.init(win);
    happoStatic.registerExample({
      component: 'Foo',
      variant: 'good',
      render: async () => {},
    });
    happoStatic.registerExample({
      component: 'Foo',
      variant: 'bad',
      render: async () => {
        throw new Error('boom');
      },
    });
    happoStatic.registerExample({
      component: 'Foo',
      variant: 'also-bad',
      render: async () => {
        throw new Error('kaboom');
      },
    });

    assertWindowHasHappo(win);
    assertHappoStaticIsInitialized(win.happo);

    const good = await win.happo.nextExample();
    assert.strictEqual(good?.component, 'Foo');
    assert.strictEqual(good?.variant, 'good');
    assert.strictEqual(good?.skipped, undefined);

    const bad = await win.happo.nextExample();
    assert.strictEqual(bad?.component, 'Foo');
    assert.strictEqual(bad?.variant, 'bad');
    assert.strictEqual(bad?.skipped, true);

    const alsoBad = await win.happo.nextExample();
    assert.strictEqual(alsoBad?.component, 'Foo');
    assert.strictEqual(alsoBad?.variant, 'also-bad');
    assert.strictEqual(alsoBad?.skipped, true);

    const { happo } = win;
    await assert.rejects(
      () => happo.nextExample!(),
      (err: unknown) => {
        assert.ok(err instanceof AggregateError, 'should be AggregateError');
        assert.strictEqual(err.errors.length, 2);
        assert.ok(
          err.errors[0] instanceof Error &&
            err.errors[0].message.includes('Foo > bad'),
          'first error should mention Foo > bad',
        );
        assert.ok(
          err.errors[1] instanceof Error &&
            err.errors[1].message.includes('Foo > also-bad'),
          'second error should mention Foo > also-bad',
        );
        return true;
      },
    );
  });

  it('does not throw when there are no errors', async () => {
    happoStatic.init(win);
    happoStatic.registerExample({
      component: 'Foo',
      variant: 'good',
      render: async () => {},
    });

    assertWindowHasHappo(win);
    assertHappoStaticIsInitialized(win.happo);

    await win.happo.nextExample();
    const done = await win.happo.nextExample();
    assert.strictEqual(done, undefined);
  });
});

describe('when __HAPPO_FAIL_ON_STORY_ERROR is false (default)', () => {
  it('re-throws render errors immediately', async () => {
    happoStatic.init(win);
    happoStatic.registerExample({
      component: 'Foo',
      variant: 'bad',
      render: async () => {
        throw new Error('boom');
      },
    });

    assertWindowHasHappo(win);
    assertHappoStaticIsInitialized(win.happo);
    const { happo } = win;

    await assert.rejects(() => happo.nextExample!(), /boom/);
  });
});

it('#registerExample validates input', () => {
  assert.throws(
    // @ts-expect-error - Testing invalid types intentionally
    () => happoStatic.registerExample({ component: 'Foo', variant: 'Bar' }),
    /Missing `render` property/,
  );
  assert.throws(
    // @ts-expect-error - Testing invalid types intentionally
    () => happoStatic.registerExample({ variant: 'Bar', render: () => {} }),
    /Missing `component` property/,
  );
  assert.throws(
    // @ts-expect-error - Testing invalid types intentionally
    () => happoStatic.registerExample({ component: 'Bar', render: () => {} }),
    /Missing `variant` property/,
  );

  assert.throws(
    () =>
      happoStatic.registerExample({
        component: 'Bar',
        variant: 'foo',
        // @ts-expect-error - Testing invalid types intentionally
        render: true,
      }),
    /Property `render` must be a function. Got "boolean"./,
  );

  assert.throws(
    () =>
      happoStatic.registerExample({
        // @ts-expect-error - Testing invalid types intentionally
        component: 123,
        variant: 'foo',
        render: () => {},
      }),
    /Property `component` must be a string. Got "number"./,
  );

  assert.throws(
    () =>
      happoStatic.registerExample({
        component: '123',
        // @ts-expect-error - Testing invalid types intentionally
        variant: () => {},
        render: () => {},
      }),
    /Property `variant` must be a string. Got "function"./,
  );
});
