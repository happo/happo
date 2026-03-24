import assert from 'node:assert';
import { describe, it } from 'node:test';

import withJSDOM from '../../test-utils/withJSDOM.ts';
import takeDOMSnapshot from '../takeDOMSnapshot.ts';

const initDOM = withJSDOM();

describe('takeDOMSnapshot', () => {
  it('takes a basic snapshot', () => {
    initDOM(`
<!DOCTYPE html>
<html class="page">
  <body data-something="foo">
    <main>Hello world</main>
  </body>
</html>
  `);
    const { document: doc } = globalThis.window;
    const element = doc.querySelector('main');
    if (!element) {
      throw new Error('Element not found');
    }
    const snapshot = takeDOMSnapshot({ doc, element });
    assert.equal(snapshot.html, '<main>Hello world</main>');
    assert.deepEqual(snapshot.htmlElementAttrs, { class: 'page' });
    assert.deepEqual(snapshot.bodyElementAttrs, { 'data-something': 'foo' });
  });

  it('works with data-happo-focus', () => {
    initDOM(`
<!DOCTYPE html>
<html>
  <body>
    <main>
      <input type="text" name="name">
      <input type="checkbox" data-happo-focus="true">
    </main>
  </body>
</html>
  `);
    const { document: doc } = globalThis.window;
    const element = doc.querySelector('main');
    if (!element) {
      throw new Error('Element not found');
    }
    let snapshot = takeDOMSnapshot({ doc, element });
    assert.equal(
      snapshot.html.trim(),
      `
    <main>
      <input type="text" name="name">
      <input type="checkbox">
    </main>
  `.trim(),
    );

    element.querySelector('input')?.focus();
    snapshot = takeDOMSnapshot({ doc, element });
    assert.equal(
      snapshot.html.trim(),
      `
    <main>
      <input type="text" name="name" data-happo-focus="true">
      <input type="checkbox">
    </main>
  `.trim(),
    );
  });

  it('works with multiple elements', () => {
    initDOM(`
<!DOCTYPE html>
<html>
  <body>
  <button>Hello</button>
  <button>World</button>
  </body>
</html>
  `);
    const { document: doc } = globalThis.window;
    const elements = doc.querySelectorAll('button');
    if (!elements || elements.length === 0) {
      throw new Error('Elements not found');
    }
    const snapshot = takeDOMSnapshot({ doc, element: elements });
    assert.equal(
      snapshot.html.trim(),
      `
  <button>Hello</button>\n<button>World</button>
  `.trim(),
    );
  });

  it('works with assets', () => {
    initDOM(`
<!DOCTYPE html>
<html>
  <head>
    <link href="/foobar.css" rel="stylesheet" />
  </head>
  <body>
  <img src="/hello.png">
  <div style="background-image: url(/world.png)">
  <svg>
      <image href="../inside-svg.png"></image>
  </svg>
  </body>
</html>
  `);
    const { document: doc } = globalThis.window;
    const element = doc.querySelector('body');
    if (!element) {
      throw new Error('Element not found');
    }
    const snapshot = takeDOMSnapshot({ doc, element });
    assert.equal(snapshot.assetUrls.length, 3);
    assert.equal(snapshot.assetUrls[0]?.url, '/hello.png');
    assert.equal(snapshot.assetUrls[1]?.url, '/world.png');
    assert.equal(snapshot.assetUrls[2]?.url, '../inside-svg.png');
    assert.equal(snapshot.cssBlocks.length, 1);
    assert.equal(snapshot.cssBlocks[0]?.href, '/foobar.css');
    assert.equal(snapshot.cssBlocks[0]?.baseUrl, 'about:blank');
  });

  describe('autoApplyPseudoStateAttributes', () => {
    it('does not affect behavior when false (default)', () => {
      initDOM(`
<!DOCTYPE html>
<html>
  <body>
    <main>
      <button data-happo-hover="true">Hover me</button>
      <button data-happo-active="true">Click me</button>
    </main>
  </body>
</html>
  `);
      const { document: doc } = globalThis.window;
      const element = doc.querySelector('main');
      if (!element) throw new Error('Element not found');

      // Without autoApplyPseudoStateAttributes, existing attributes are preserved
      const snapshot = takeDOMSnapshot({ doc, element });
      assert.ok(
        snapshot.html.includes('data-happo-hover="true"'),
        'data-happo-hover should be preserved',
      );
      assert.ok(
        snapshot.html.includes('data-happo-active="true"'),
        'data-happo-active should be preserved',
      );
    });

    it('auto-detects focused element', () => {
      initDOM(`
<!DOCTYPE html>
<html>
  <body>
    <main>
      <input type="text" id="first">
      <input type="text" id="second">
    </main>
  </body>
</html>
  `);
      const { document: doc } = globalThis.window;
      const element = doc.querySelector('main');
      if (!element) throw new Error('Element not found');

      doc.querySelector<HTMLInputElement>('#first')?.focus();
      const snapshot = takeDOMSnapshot({ doc, element, autoApplyPseudoStateAttributes: true });
      assert.ok(
        snapshot.html.includes('id="first" data-happo-focus="true"'),
        'focused element should have data-happo-focus',
      );
      assert.ok(
        !snapshot.html.includes('id="second" data-happo-focus'),
        'non-focused element should not have data-happo-focus',
      );
    });

    it('clears stale data-happo-hover and data-happo-active attributes', () => {
      initDOM(`
<!DOCTYPE html>
<html>
  <body>
    <main>
      <button data-happo-hover="true">Hover me</button>
      <button data-happo-active="true">Click me</button>
    </main>
  </body>
</html>
  `);
      const { document: doc } = globalThis.window;
      const element = doc.querySelector('main');
      if (!element) throw new Error('Element not found');

      // With autoApplyPseudoStateAttributes, stale manual attributes are cleared
      // (since nothing is currently hovered/active in JSDOM)
      const snapshot = takeDOMSnapshot({ doc, element, autoApplyPseudoStateAttributes: true });
      assert.ok(
        !snapshot.html.includes('data-happo-hover'),
        'stale data-happo-hover should be cleared',
      );
      assert.ok(
        !snapshot.html.includes('data-happo-active'),
        'stale data-happo-active should be cleared',
      );
    });

    it('detects focus inside shadow DOM', () => {
      initDOM(`
<!DOCTYPE html>
<html>
  <body>
    <main></main>
  </body>
</html>
  `);
      const { document: doc } = globalThis.window;
      const main = doc.querySelector('main');
      if (!main) throw new Error('main not found');

      // Create a shadow host with a focusable element inside
      const host = doc.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });
      shadowRoot.innerHTML = '<input type="text" id="shadow-input">';
      main.append(host);

      const shadowInput = shadowRoot.querySelector<HTMLInputElement>('#shadow-input');
      if (!shadowInput) throw new Error('shadow input not found');
      shadowInput.focus();

      // The shadow host's shadow root activeElement should be the input
      assert.equal(doc.activeElement, host, 'shadow host should be the activeElement');
      assert.equal(
        doc.activeElement?.shadowRoot?.activeElement,
        shadowInput,
        'shadow input should be the deep activeElement',
      );

      // With autoApplyPseudoStateAttributes, we traverse shadow roots to find the real focused element
      const snapshot = takeDOMSnapshot({ doc, element: main, autoApplyPseudoStateAttributes: true });
      assert.ok(
        snapshot.html.includes('data-happo-focus="true"'),
        'shadow-DOM focused element should have data-happo-focus applied',
      );
    });
  });

  it('works with radio and checkbox', () => {
    initDOM(`
<!DOCTYPE html>
<html>
  <body>
    <form>
      <input type="radio" name="foo" value="a">
      <input type="radio" name="foo" value="b" checked="checked">
      <input type="radio" name="foo" value="c">
      <input type="checkbox" name="bar" checked="checked">
      <input type="checkbox" name="baz">
      <input type="checkbox" name="car">
    </form>
  </body>
</html>
  `);
    const { document: doc } = globalThis.window;
    const radioInput = doc.querySelector<HTMLInputElement>(
      'input[type="radio"][value="a"]',
    );
    const checkboxInput = doc.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name="baz"]',
    );
    if (!radioInput || !checkboxInput) {
      throw new Error('Input elements not found');
    }
    radioInput.checked = true;
    checkboxInput.checked = true;
    const element = doc.querySelector('form');
    if (!element) {
      throw new Error('Element not found');
    }
    const snapshot = takeDOMSnapshot({ doc, element });
    assert.equal(
      snapshot.html,
      `
    <form>
      <input type="radio" name="foo" value="a" checked="checked">
      <input type="radio" name="foo" value="b">
      <input type="radio" name="foo" value="c">
      <input type="checkbox" name="bar" checked="checked">
      <input type="checkbox" name="baz" checked="checked">
      <input type="checkbox" name="car">
    </form>
  `.trim(),
    );
  });
});
