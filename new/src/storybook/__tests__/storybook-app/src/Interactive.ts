import type { ReactNode } from 'react';
import { createElement, useState } from 'react';

export default function Interactive(): ReactNode {
  const [value, setValue] = useState<boolean | undefined>();
  return createElement(
    'div',
    null,
    createElement('button', { onClick: () => setValue((old) => !old) }, 'click me'),
    value && createElement('p', null, 'I was clicked'),
    !value && createElement('p', null, 'I was not clicked'),
  );
}
