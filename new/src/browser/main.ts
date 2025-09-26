import takeDOMSnapshot from './takeDOMSnapshot.js';

declare global {
  interface Window {
    happoTakeDOMSnapshot: typeof takeDOMSnapshot;
  }
}

globalThis.window.happoTakeDOMSnapshot = takeDOMSnapshot;
