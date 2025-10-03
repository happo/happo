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
    assert.throws(() => assertElement(el, globalThis.window));
  });

  it('does not throw if the element is an HTMLElement', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElement('div');
    assert.doesNotThrow(() => assertElement(el, globalThis.window));
  });

  it('does not throw if the element is an MathMLElement', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElement('math');
    assert.doesNotThrow(() => assertElement(el, globalThis.window));
  });

  it('does not throw if the element is an SVGElement', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    assert.doesNotThrow(() => assertElement(el, globalThis.window));
  });

  it('does not throw if the element is an array of elements', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElement('div');
    assert.doesNotThrow(() => assertElement([el], globalThis.window));
  });

  it('throws if the element is an array of non-elements', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElement('div');
    assert.throws(() => assertElement([el, 'not an element'], globalThis.window));
  });

  it('does not throw if the element is a NodeList of elements', () => {
    initDOM('<!DOCTYPE html>');
    const { document: doc } = globalThis.window;
    const el = doc.createElement('div');
    doc.body.append(el);
    const nodeList = doc.querySelectorAll('div');
    assert.doesNotThrow(() => assertElement(nodeList, globalThis.window));
  });
});
