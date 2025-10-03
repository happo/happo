import type { WindowHappo } from '../isomorphic/types.ts';
import assertElement from './assertElement.ts';
import takeDOMSnapshot from './takeDOMSnapshot.ts';

declare global {
  var happo: WindowHappo;
}

const happo: WindowHappo = {
  takeDOMSnapshot,
  assertElement,
};

globalThis.happo = happo;
