import assert from 'node:assert';
import { describe, it } from 'node:test';

import withJSDOM from '../../test-utils/withJSDOM.ts';
import assertElement from '../assertElement.ts';

const initDOM = withJSDOM();

describe('assertElement', () => {
  it('throws if the element is null', () => {
    assert.throws(() => assertElement(null));
  });

  it('throws if the element is a text node', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createTextNode('text node');
    assert.throws(() => assertElement(el));
  });

  it('does not throw if the element is an HTMLElement', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElement('div');
    assert.doesNotThrow(() => assertElement(el));
  });

  it('does not throw if the element is an MathMLElement', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElement('math');
    assert.doesNotThrow(() => assertElement(el));
  });

  it('does not throw if the element is an SVGElement', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    assert.doesNotThrow(() => assertElement(el));
  });

  it('does not throw if the element is an array of elements', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElement('div');
    assert.doesNotThrow(() => assertElement([el]));
  });

  it('throws if the element is an array of non-elements', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElement('div');
    assert.throws(() => assertElement([el, 'not an element']));
  });

  it('does not throw if the element is a NodeList of elements', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElement('div');
    doc.body.append(el);
    const nodeList = doc.querySelectorAll('div');
    assert.doesNotThrow(() => assertElement(nodeList));
  });

  it('does not throw if the element is in an iframe', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const iframe = doc.createElement('iframe');
    doc.body.append(iframe);
    assert.doesNotThrow(() => assertElement(iframe.contentDocument?.body));
  });

  it('does not throw if the element is a NodeList of elements in an iframe', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const iframe = doc.createElement('iframe');
    doc.body.append(iframe);

    const els = [
      iframe.contentDocument?.createElement('div'),
      iframe.contentDocument?.createElement('div'),
    ];

    for (const el of els) {
      if (!el) {
        throw new Error('Failed to create element');
      }

      iframe.contentDocument?.body.append(el);
    }

    const nodeList = iframe.contentDocument?.body.querySelectorAll('div');
    assert.doesNotThrow(() => assertElement(nodeList));
  });

  it('throws if the element is a NodeList of non-elements in an iframe', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const iframe = doc.createElement('iframe');
    doc.body.append(iframe);
    const textNode = iframe.contentDocument?.createTextNode('text node');
    if (!textNode || !iframe.contentDocument?.body) {
      throw new Error('Failed to create text node in iframe');
    }
    iframe.contentDocument.body.append(textNode);
    const nodeList = iframe.contentDocument.body.childNodes;
    assert.throws(() => assertElement(nodeList));
  });
});
