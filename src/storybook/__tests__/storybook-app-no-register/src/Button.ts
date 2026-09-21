import type { ReactNode } from 'react';
import { createElement } from 'react';

export default function Button({ label }: { label: string }): ReactNode {
  return createElement('button', { type: 'button' }, label);
}
