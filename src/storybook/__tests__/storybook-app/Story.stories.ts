import type { ReactNode } from 'react';
import { createElement, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ErrorBoundary } from 'react-error-boundary';

// @ts-expect-error no types available for this image. TODO: fix this by adding a type to a .d.ts file.
import testImage from './public/testImage.png';
import Button from './src/Button.ts';
import type { StoryObj } from './types.ts';

export default {
  title: 'Stories',
};

function AsyncComponent(): ReactNode {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setTimeout(() => setReady(true), 80);
  }, []);
  if (!ready) {
    return null;
  }
  return createElement('span', null, 'ready!');
}

function UnmountFail(): ReactNode {
  useEffect(() => {
    return () => {
      throw new Error('Failed');
    };
  }, []);
  return createElement('span', null, 'I throw on unmount');
}

function PortalComponent(): ReactNode {
  const domNode =
    document.getElementById('portal-root') ||
    (() => {
      const el = document.createElement('div');
      el.setAttribute('id', 'portal-root');
      document.body.append(el);
      return el;
    })();
  return createPortal(createElement('h1', null, "I'm in a portal!"), domNode);
}

function DataFetchComponent(): ReactNode {
  const [xhr, setXhr] = useState(false);
  const [fetch, setFetch] = useState(false);
  useEffect(() => {
    const apiUrl = 'https://api.restful-api.dev/objects';
    const xhr = new XMLHttpRequest();
    xhr.addEventListener('load', async () => {
      setXhr(true);
      await globalThis.fetch(`${apiUrl}/2`);
      await globalThis.fetch(`${apiUrl}/3`);
      setFetch(true);
    });
    xhr.open('GET', `${apiUrl}/1`, true);
    xhr.send();
  }, []);
  if (!xhr || !fetch) {
    return createElement('div', null, 'Nothing ready');
  }
  return createElement(
    'ul',
    null,
    xhr && createElement('li', null, 'XHR ready'),
    fetch && createElement('li', null, 'Fetch ready'),
  );
}

function AsyncContent(): ReactNode {
  const [asyncContent, setAsyncContent] = useState('');

  useEffect(() => {
    setTimeout(() => {
      setAsyncContent('world!');
    }, 1000);
  }, []);

  if (!asyncContent) {
    return null;
  }

  return createElement(
    'div',
    null,
    createElement(
      'h1',
      null,
      'Hello ',
      createElement('span', { className: 'async-inner' }, asyncContent),
    ),
  );
}

function Async2(): ReactNode {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setTimeout(() => {
      setReady(true);
    }, 1000);
  }, []);
  return createElement(
    'div',
    { 'data-async-ready': ready },
    createElement('h1', null, ready ? 'Ready' : 'Not ready'),
  );
}

function ClickToReveal(): ReactNode {
  const [open, setOpen] = useState(false);
  if (open) {
    return createElement('div', null, "I'm open");
  }
  return createElement('button', { onClick: () => setOpen(true) }, 'Open');
}

export const Themed: StoryObj = {
  render: (): ReactNode =>
    createElement('div', { style: { color: 'gray' } }, 'My color is gray'),
  parameters: {
    happo: { themes: ['black', 'white'] as const },
  },
};

export const NotPartOfHappo: StoryObj = {
  render: (): ReactNode => createElement(AsyncComponent),
  parameters: { happo: false },
};

export const ClickToRevealStory: StoryObj = {
  render: (): ReactNode => createElement(ClickToReveal),
  parameters: {
    happo: {
      beforeScreenshot: (args?: { rootElement?: HTMLElement }): void => {
        const rootElement = args?.rootElement;
        if (!rootElement) return;
        const clickEvent = new MouseEvent('click', {
          view: globalThis.window,
          bubbles: true,
          cancelable: false,
        });
        rootElement.querySelector('button')?.dispatchEvent(clickEvent);
      },
    },
  },
};

export const ModifyGlobalState: StoryObj = {
  render: (): ReactNode => createElement('div', null, 'Modify Global State'),
  parameters: {
    happo: {
      beforeScreenshot: (): void => {
        const el = document.createElement('div');
        el.id = 'global-state';
        el.innerHTML = 'clean up after me!';
        document.body.append(el);

        // We should be able to fail here and still have a screenshot taken
        throw new Error('Whoopsie!');
      },
      afterScreenshot: (): void => {
        document.querySelector('#global-state')?.remove();

        // We should be able to fail here and still have execution continue
        throw new Error('Whoopsie!');
      },
    },
  },
};

export const Lazy: StoryObj = {
  render: (): ReactNode => createElement(AsyncComponent),
};
export const Portal: StoryObj = {
  render: (): ReactNode => PortalComponent(),
};
export const DataFetch: StoryObj = {
  render: (): ReactNode => createElement(DataFetchComponent),
};
export const ExecuteAGraphQLMutationAndHandleTheResponseWhenReceived: StoryObj = {
  render: (): ReactNode => createElement('div', null, 'I am done'),
};
export const AsyncWithWaitForContent: StoryObj = {
  render: (): ReactNode => createElement(AsyncContent),
  parameters: {
    happo: { waitForContent: 'world' },
  },
};
export const AsyncWithWaitFor: StoryObj = {
  render: (): ReactNode => createElement(AsyncContent),
  parameters: {
    happo: {
      waitFor: (): boolean | null => {
        return !!document.querySelector('.async-inner');
      },
      beforeScreenshot: (): Promise<void> => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(void 0);
          }, 100);
        });
      },
    },
  },
};

export const AsyncWithDelay: StoryObj = {
  render: (): ReactNode => createElement(AsyncContent),
  parameters: {
    happo: { delay: 1200 },
  },
};

export const AsyncWithWaitForDataSelector: StoryObj = {
  render: (): ReactNode => createElement(Async2),
  parameters: {
    happo: {
      waitFor: (): boolean | null =>
        !!document.querySelector('[data-async-ready=true]'),
    },
  },
};

export const ButtonWithText: StoryObj = {
  render: (): ReactNode => createElement(Button, null, 'Hello Button'),
};
export const ButtonFirefoxOnly: StoryObj = {
  render: (): ReactNode => createElement(Button, null, 'Hello Firefox Button'),
  parameters: {
    happo: { targets: ['firefox'] as const },
  },
};
export const ButtonWithImage: StoryObj = {
  render: (): ReactNode =>
    createElement(Button, null, createElement('img', { src: testImage })),
};
export const ButtonWithStaticImage: StoryObj = {
  render: (): ReactNode =>
    createElement(
      Button,
      null,
      createElement('img', { src: '/assets/staticImage.png' }),
    ),
};
export const ButtonWithSomeEmoji: StoryObj = {
  render: (): ReactNode =>
    createElement(
      Button,
      null,
      createElement('span', { role: 'img', 'aria-label': 'so cool' }, '😀 😎 👍 💯'),
    ),
};

export const MiscLarge: StoryObj = {
  render: (): ReactNode =>
    createElement('div', {
      style: { width: 400, height: 400, backgroundColor: 'red' },
    }),
};
export const MiscFailingOnUnmount: StoryObj = {
  render: (): ReactNode => createElement(UnmountFail),
};

function ComponentThatThrows(): ReactNode {
  throw new Error('Some error');
}

// https://github.com/bvaughn/react-error-boundary?tab=readme-ov-file#errorboundary-with-fallbackrender-prop
function fallbackRender({ error }: { error: Error }): ReactNode {
  // We need to sanitize ports, asset hashes, and line/col numbers from
  // the stack trace to make the Happo diffs stabilized.
  if (error.stack) {
    error.stack = error.stack.replaceAll(
      /http:\/\/localhost:\d{4}.*?:\d+:\d+/g,
      'http://localhost:1234/path-to-file.1234abcd.bundle.js:1234:56',
    );
  }

  return createElement('div', null, `Error: ${error.message}`);
}
export const MiscFailing: StoryObj = {
  render: (): ReactNode =>
    createElement(
      ErrorBoundary,
      { fallbackRender },
      createElement(ComponentThatThrows),
    ),
  parameters: { happo: { delay: 300 } },
};
