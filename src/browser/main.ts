import type { WindowHappo } from '../isomorphic/types.ts';
import takeDOMSnapshot from './takeDOMSnapshot.ts';

declare global {
  var happo: WindowHappo | undefined;
}

const happo: WindowHappo = {
  takeDOMSnapshot,
};

globalThis.happo = happo;

// Track hover and active elements via mouse events so that takeDOMSnapshot
// can apply data-happo-hover / data-happo-active reliably even in headless
// browsers where querySelectorAll(':hover') / ':active' may not reflect state.
let _happoHoveredElement: Element | null = null;
let _happoActiveElement: Element | null = null;

document.addEventListener(
  'mouseover',
  (e) => {
    if (e.target instanceof Element) {
      _happoHoveredElement = e.target;
    }
  },
  true,
);
document.addEventListener(
  'mouseout',
  (e) => {
    if (_happoHoveredElement === e.target) {
      _happoHoveredElement = null;
    }
  },
  true,
);
document.addEventListener(
  'mousedown',
  (e) => {
    if (e.target instanceof Element) {
      _happoActiveElement = e.target;
    }
  },
  true,
);
document.addEventListener('mouseup', () => {
  _happoActiveElement = null;
}, true);

Object.defineProperty(globalThis, '__happoHoveredElement', {
  get: () => _happoHoveredElement,
  configurable: true,
});
Object.defineProperty(globalThis, '__happoActiveElement', {
  get: () => _happoActiveElement,
  configurable: true,
});
