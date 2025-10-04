import type { ReactNode } from 'react';

// Base StoryObj interface (since @storybook/react types aren't available in test environment)
export interface BaseStoryObj {
  render?: () => ReactNode;
  play?: (args: {
    args?: Record<string, unknown>;
    canvasElement?: HTMLElement;
    step?: (name: string, fn: () => Promise<void>) => Promise<void>;
  }) => Promise<void>;
  beforeEach?: () => (() => Promise<void>) | (() => void);
  parameters?: Record<string, unknown>;
}

// Happo-specific parameters for Storybook stories
export interface HappoParameters {
  themes?: ReadonlyArray<string>;
  targets?: ReadonlyArray<string>;
  waitForContent?: string;
  waitFor?: () => boolean | null;
  beforeScreenshot?: (args?: { rootElement?: HTMLElement }) => void | Promise<void>;
  afterScreenshot?: (args?: { rootElement?: HTMLElement }) => void | Promise<void>;
  delay?: number;
}

// Extended StoryObj type that includes Happo parameters
export interface StoryObj extends BaseStoryObj {
  parameters?: BaseStoryObj['parameters'] & {
    happo?: HappoParameters | false;
  };
}
