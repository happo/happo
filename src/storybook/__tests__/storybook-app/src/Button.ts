import type { ReactNode } from 'react';
import { createElement } from 'react';

interface ButtonProps {
  children: ReactNode;
}

export default function Button({ children }: ButtonProps): ReactNode {
  return createElement(
    'button',
    {
      style: {
        fontSize: '2em',
        textAlign: 'center',
        color: 'palevioletred',
      },
    },
    'hello ',
    children,
  );
}
