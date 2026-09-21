import type { Decorator } from '@storybook/react-vite';

import happoDecorator from '../../browser/decorator.ts';

// There is deliberately no `import '../../browser/register.ts'` here, and
// nothing else under this directory imports it either. See main.ts.
//
// The decorator is kept, because installing it is the other half of what the
// setup docs suggest, and it has to work without the runtime import too.
export const decorators: Array<Decorator> = [happoDecorator];
