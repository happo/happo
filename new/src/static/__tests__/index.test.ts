import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import happoStatic, { type ExtendedWindow } from '../index.ts';

let win: ExtendedWindow;
beforeEach(() => {
  win = {} as ExtendedWindow;
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

    if (!win.happo) {
      throw new Error('win.happo is not initialized');
    }
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

    if (!win.happo) {
      throw new Error('win.happo is not initialized');
    }
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

  if (!win.happo) {
    throw new Error('win.happo is not initialized');
  }
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
  if (!win.happo) {
    throw new Error('win.happo is not initialized');
  }
  const example = await win.happo.nextExample();
  assert.strictEqual(example?.component, 'Foo');
  assert.strictEqual(example?.variant, 'default');
  assert.strictEqual(example?.waitForContent, 'what?');
  const nextExample = await win.happo.nextExample();
  assert.strictEqual(nextExample, undefined);
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
