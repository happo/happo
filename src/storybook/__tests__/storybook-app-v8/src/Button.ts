import type { ReactNode } from 'react';
import { createElement } from 'react';

interface ButtonProps {
  label: string;
}

export default function Button({ label }: ButtonProps): ReactNode {
  return createElement(
    'button',
    {
      style: {
        fontSize: '1em',
        padding: '8px 16px',
        color: 'white',
        backgroundColor: 'steelblue',
        border: 'none',
        borderRadius: 4,
      },
    },
    label,
  );
}
