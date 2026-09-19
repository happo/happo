import {
  addons,
  makeDecorator,
  useEffect,
} from 'storybook/internal/preview-api';

import { SB_ROOT_ELEMENT_SELECTOR } from './constants.ts';

interface HappoParams {
  [key: string]: ((args: { rootElement: Element | null }) => unknown) | unknown;
}

/**
 * Wires the Happo addon panel up to the `happo` parameters on the current
 * story: it announces which of them are functions (so the panel can offer an
 * "Invoke" button for each) and runs the one the panel asks for.
 *
 * Storybook's own `useEffect` is used rather than React's, and the story is
 * returned untouched rather than wrapped in a component. Both matter: this
 * decorator is installed in `.storybook/preview`, which is shared by every
 * renderer, and a React element handed to a Lit/Vue/Svelte renderer is not
 * something it can render -- it ends up interpolated into the surrounding
 * template as `[object Object]`, silently replacing every screenshot in the
 * report. Storybook's hooks work the same way under every renderer.
 */
export const withHappo: ReturnType<typeof makeDecorator> = makeDecorator({
  name: 'withHappo',
  parameterName: 'happo',
  wrapper: (getStory, context) => {
    const params = (context.parameters.happo || null) as HappoParams | null;

    useEffect(() => {
      if (!params) {
        return;
      }

      const channel = addons.getChannel();
      async function listen({ funcName }: { funcName: string }) {
        const rootElement = document.querySelector(SB_ROOT_ELEMENT_SELECTOR);
        if (params && params[funcName] && typeof params[funcName] === 'function') {
          const result = params[funcName]({ rootElement });

          if (result instanceof Promise) {
            console.log(`Invoked Happo function \`${funcName}\`. Awaiting result...`);
            const finalResult = await result;
            console.log(
              `Async result of Happo function \`${funcName}\`:`,
              finalResult,
            );
          } else {
            console.log(
              `Invoked Happo function \`${funcName}\`. Return value:`,
              result,
            );
          }
        } else {
          console.warn(`Happo function ${funcName} not found.`);
        }
      }

      channel.on('happo/functions/invoke', listen);
      channel.emit('happo/functions/params', {
        params: Object.keys(params)
          .map((key) => {
            if (typeof params[key] === 'function') {
              return {
                key,
                value: params[key],
              };
            }
            return null;
          })
          .filter(Boolean),
      });

      return () => {
        channel.off('happo/functions/invoke', listen);
      };
    }, [params]);

    return getStory(context);
  },
});

export default withHappo;
