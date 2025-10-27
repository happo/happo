import type { WindowHappo } from '../isomorphic/types.ts';
import takeDOMSnapshot from './takeDOMSnapshot.ts';

declare global {
  var happo: WindowHappo | undefined;
}

const happo: WindowHappo = {
  takeDOMSnapshot,
};

globalThis.happo = happo;
