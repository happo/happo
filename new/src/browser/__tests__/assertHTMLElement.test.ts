import assert from 'node:assert';
import { describe, it } from 'node:test';

import withJSDOM from '../../test-utils/withJSDOM.ts';
import assertHTMLElement from '../assertHTMLElement.ts';

const initDOM = withJSDOM();

describe('assertHTMLElement', () => {
  it('throws if the element is null', () => {
    assert.throws(() => assertHTMLElement(null));
  });

  it('throws if the element is a text node', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createTextNode('text node');
    assert.throws(() => assertHTMLElement(el, globalThis.window));
  });

  it('throws if the element is an SVGElement', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    assert.throws(() => assertHTMLElement(el, globalThis.window));
  });

  it('does not throw if the element is an HTMLElement', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElement('div');
    assert.doesNotThrow(() => assertHTMLElement(el, globalThis.window));
  });
});
