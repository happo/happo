import type { Decorator } from '@storybook/react-vite';

import happoDecorator from '../../../../dist/storybook/browser/decorator.js';
import {
  setRenderTimeoutMs,
  setThemeSwitcher,
} from '../../../../dist/storybook/browser/register.js';

setThemeSwitcher(async (theme) => {
  // Make sure that it can be async
  await new Promise((r) => setTimeout(r, 100));

  document.body.style = `background-color: ${theme}`;
});

setRenderTimeoutMs(4000);

export default {
  parameters: {
    happo: {
      themes: ['white'] as const,
    },
  },
};

export const decorators: Array<Decorator> = [happoDecorator];
