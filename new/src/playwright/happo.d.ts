import type { ElementHandle, Node } from '@playwright/test';

interface HappoSnapshotOptions {
  doc?: Document | null;
  element?: ElementHandle | Node | null;
  strategy?: 'hoist' | 'clip';
}

declare global {
  interface Window {
    happoTakeDOMSnapshot: (options: HappoSnapshotOptions) => Promise<{
      html: string;
      css: string;
    }>;
  }
}
