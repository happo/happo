import happoDecorator from '../../browser/decorator.ts';
import { setRenderTimeoutMs, setThemeSwitcher } from '../../browser/register.ts';

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

export const decorators = [happoDecorator];
