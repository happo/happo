import type { ReactNode } from 'react';
import { createElement } from 'react';

import Button from './src/Button.ts';

export default {
  title: 'Simple',
};

export const Basic = {
  render: (): ReactNode => createElement(Button, { label: 'Click me' }),
};

// Whether this one is rendered is the runtime's decision, so its absence from
// the run is evidence that the injected copy is the one in charge.
export const Excluded = {
  render: (): ReactNode => createElement('div', null, 'not in happo'),
  parameters: { happo: false },
};

// Likewise: one example per theme is the runtime expanding this story.
export const Themed = {
  render: (): ReactNode =>
    createElement('div', { style: { color: 'currentColor' } }, 'themed text'),
  parameters: {
    happo: { themes: ['light', 'dark'] as const },
  },
};
