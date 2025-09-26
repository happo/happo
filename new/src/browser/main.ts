import takeDOMSnapshot from './takeDOMSnapshot.ts';

declare global {
  interface Window {
    happoTakeDOMSnapshot: typeof takeDOMSnapshot;
  }
}

globalThis.window.happoTakeDOMSnapshot = takeDOMSnapshot;
