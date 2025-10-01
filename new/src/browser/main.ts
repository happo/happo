import type { WindowHappo } from '../isomorphic/types.ts';
import assertHTMLElement from './assertHTMLElement.ts';
import takeDOMSnapshot from './takeDOMSnapshot.ts';

declare global {
  var happo: WindowHappo['happo'];
}

const happo: WindowHappo['happo'] = {
  takeDOMSnapshot,
  assertHTMLElement,
};

globalThis.happo = happo;
