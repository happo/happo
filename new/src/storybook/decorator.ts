import React, { useEffect } from 'react';
import { addons, makeDecorator } from 'storybook/preview-api';

import { SB_ROOT_ELEMENT_SELECTOR } from './constants.ts';

function HappoDecorator({ params, children }) {
  useEffect(() => {
    if (!params) return;

    const channel = addons.getChannel();
    async function listen({ funcName }) {
      const rootElement = document.querySelector(SB_ROOT_ELEMENT_SELECTOR);
      if (params[funcName] && typeof params[funcName] === 'function') {
        const result = params[funcName]({ rootElement });

        if (result instanceof Promise) {
          console.log(
            `Invoked Happo function \`${funcName}\`. Awaiting result...`,
          );
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

  return children;
}

export const withHappo = makeDecorator({
  name: 'withHappo',
  parameterName: 'happo',
  wrapper: (Story, context) => {
    return (
      <HappoDecorator params={context.parameters.happo}>
        <Story />
      </HappoDecorator>
    );
  },
});

export default withHappo;
