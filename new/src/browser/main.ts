import type { WindowHappo } from '../isomorphic/types.ts';
import assertHTMLElement from './assertHTMLElement.ts';
import takeDOMSnapshot from './takeDOMSnapshot.ts';

declare global {
  interface Window {
    happo: WindowHappo['happo'];
  }
}

const happo: WindowHappo['happo'] = {
  takeDOMSnapshot,
  assertHTMLElement,
};

globalThis.window.happo = happo;
