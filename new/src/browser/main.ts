import type { WindowHappo } from '../isomorphic/types.ts';
import assertElement from './assertElement.ts';
import takeDOMSnapshot from './takeDOMSnapshot.ts';

declare global {
  var happo: WindowHappo['happo'];
}

const happo: WindowHappo['happo'] = {
  takeDOMSnapshot,
  assertElement,
};

globalThis.happo = happo;
