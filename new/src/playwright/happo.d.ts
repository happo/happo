import type { WindowHappo } from '../isomorphic/types.ts';

declare global {
  interface Window {
    happo: WindowHappo['happo'];
  }
}
