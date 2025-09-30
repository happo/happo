import type {
  DOMSnapshotResult,
  TakeDOMSnapshotOptions,
} from '../isomorphic/types.ts';

declare global {
  interface Window {
    happoTakeDOMSnapshot: (
      options: TakeDOMSnapshotOptions,
    ) => Promise<DOMSnapshotResult>;
  }
}
