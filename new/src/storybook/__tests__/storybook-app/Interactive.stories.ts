import type { ReactNode } from 'react';
import { createElement, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { forceHappoScreenshot } from '../../browser/register.ts';
import type { StoryObj } from './types.js';

function Interactive(): ReactNode {
  const [value, setValue] = useState<boolean | undefined>();
  return createElement(
    'div',
    null,
    createElement('button', { onClick: () => setValue((old) => !old) }, 'click me'),
    value && createElement('p', null, 'I was clicked'),
    !value && createElement('p', null, 'I was not clicked'),
  );
}

export default {
  title: 'Interactive',
  component: Interactive,
  argTypes: {
    onClick: { action: true },
  },
};

export const Demo: StoryObj = {
  play: async ({ args, canvasElement, step }) => {
    if (!canvasElement || !step) return;
    const canvas = within(canvasElement);
    await new Promise((r) => setTimeout(r, 3000));

    await step('clicked', async () => {
      console.log(args);
      await userEvent.click(canvas.getByRole('button'));
      await expect(canvas.getByText('I was clicked')).toBeInTheDocument();
      await forceHappoScreenshot('clicked');
    });

    await step('second click', async () => {
      await userEvent.click(canvas.getByRole('button'));
      await expect(canvas.getByText('I was not clicked')).toBeInTheDocument();
      await forceHappoScreenshot('second click');
    });
  },

  beforeEach: () => {
    // Add afterEach hook for waiting and logging between tests
    return async () => {
      console.log('Test completed, waiting 500ms before next test...');
      await new Promise((resolve) => setTimeout(resolve, 500));
    };
  },
};

export const InteractiveThrowsError: StoryObj = {
  // This story exists to test what happens when the play function throws an
  // error that isn't caused by `forceHappoScreenshot`.
  play: async ({ canvasElement, step }) => {
    if (!canvasElement || !step) return;
    const canvas = within(canvasElement);
    await new Promise((r) => setTimeout(r, 200));

    await step('clicked', async () => {
      await userEvent.click(canvas.getByRole('button'));
      await expect(canvas.getByText('I was clicked')).toBeInTheDocument();
      await forceHappoScreenshot('clicked');
      throw new Error('Whoops');

      // We will never reach this line
      await forceHappoScreenshot('clicked2');
    });
  },
};
