import type { Decorator } from '@storybook/react-vite';

import happoDecorator from '../../browser/decorator.ts';

// There is deliberately no `import '../../browser/register.ts'` here.
//
// This fixture is the one that proves the Happo client runtime the CLI injects
// into the built package is enough on its own: nothing under this directory
// imports the runtime, so the only copy in the page is the one
// `buildStorybookPackage()` put there. `pnpm test:storybook:v8` renders it on
// real Happo workers, and `injectedRuntime.spec.ts` drives it in a browser.
//
// Keep it that way. Adding an import here would still pass both, and would
// silently take the coverage away. The sibling `storybook-app` fixture covers
// the other direction, where a project imports the runtime itself.
export const decorators: Array<Decorator> = [happoDecorator];
