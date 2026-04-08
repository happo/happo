import { Component, createElement, type ReactNode, useEffect } from 'react';
import { addons, makeDecorator } from 'storybook/preview-api';

import { SB_ROOT_ELEMENT_SELECTOR } from './constants.ts';

interface HappoErrorBoundaryState {
  hasError: boolean;
}

class HappoErrorBoundary extends Component<
  { children: ReactNode },
  HappoErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): HappoErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error): void {
    const channel = addons.getChannel();
    channel.emit('happo/renderError', {
      message: error.message,
      stack: error.stack,
    });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

interface HappoParams {
  [key: string]: ((args: { rootElement: Element | null }) => unknown) | unknown;
}

function HappoDecorator({
  params,
  children,
}: {
  params: HappoParams | null;
  children: ReactNode;
}) {
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

  return children;
}

export const withHappo: ReturnType<typeof makeDecorator> = makeDecorator({
  name: 'withHappo',
  parameterName: 'happo',
  wrapper: (Story, context) => {
    const storyElement = createElement(Story as React.ComponentType, null);
    const wrappedStory =
      globalThis.__IS_HAPPO_RUN && globalThis.happo?.failOnRenderError
        ? createElement(HappoErrorBoundary, null, storyElement)
        : storyElement;
    return createElement(HappoDecorator, {
      params: context.parameters.happo || null,
      children: wrappedStory,
    });
  },
});

export default withHappo;
