import type { ReactNode } from 'react';
import { createElement } from 'react';

import Button from './src/Button.ts';

export default {
  title: 'Simple',
};

export const Basic = {
  render: (): ReactNode => createElement(Button, { label: 'Click me' }),
};

export const Excluded = {
  render: (): ReactNode => createElement('div', null, 'not in happo'),
  parameters: { happo: false },
};

export const Themed = {
  render: (): ReactNode =>
    createElement('div', { style: { color: 'currentColor' } }, 'themed text'),
  parameters: {
    happo: { themes: ['light', 'dark'] as const },
  },
};
