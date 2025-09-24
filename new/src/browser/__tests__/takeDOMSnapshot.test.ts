import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

import takeDOMSnapshot from '../takeDOMSnapshot.ts';

function initDOM(html: string) {
  const dom = new JSDOM(html);
  globalThis.window = dom.window;
}

describe('takeDOMSnapshot', () => {
  afterEach(() => {
    globalThis.window = undefined;
  });

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
    const element = doc.querySelectorAll('button');
    if (!element) {
      throw new Error('Element not found');
    }
    let snapshot = takeDOMSnapshot({ doc, element });
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
    let snapshot = takeDOMSnapshot({ doc, element });
    assert.equal(snapshot.assetUrls.length, 3);
    assert.equal(snapshot.assetUrls[0]?.url, '/hello.png');
    assert.equal(snapshot.assetUrls[1]?.url, '/world.png');
    assert.equal(snapshot.assetUrls[2]?.url, '../inside-svg.png');
    assert.equal(snapshot.cssBlocks.length, 1);
    assert.equal(snapshot.cssBlocks[0]?.href, '/foobar.css');
    assert.equal(snapshot.cssBlocks[0]?.baseUrl, 'about:blank');
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
    const radioInput = doc.querySelector(
      'input[type="radio"][value="a"]',
    ) as HTMLInputElement;
    const checkboxInput = doc.querySelector(
      'input[type="checkbox"][name="baz"]',
    ) as HTMLInputElement;
    if (!radioInput || !checkboxInput) {
      throw new Error('Input elements not found');
    }
    radioInput.checked = true;
    checkboxInput.checked = true;
    const element = doc.querySelector('form') as HTMLFormElement;
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
