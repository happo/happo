import type { Decorator } from '@storybook/react-vite';

import happoDecorator from '../../browser/decorator.ts';
import '../../browser/register.ts';

export const decorators: Array<Decorator> = [happoDecorator];
