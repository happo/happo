import type { WindowHappo } from '../isomorphic/types.ts';
import takeDOMSnapshot from './takeDOMSnapshot.ts';

declare global {
  var happo: WindowHappo | undefined;
}

const happo: WindowHappo = {
  takeDOMSnapshot,
};

globalThis.happo = happo;

// Track the hovered element via mouseover/mouseout events so that
// takeDOMSnapshot can apply data-happo-hover reliably even in headless
// browsers where querySelectorAll(':hover') may not reflect live state.
let _happoHoveredElement: Element | null = null;
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
Object.defineProperty(globalThis, '__happoHoveredElement', {
  get: () => _happoHoveredElement,
  configurable: true,
});
