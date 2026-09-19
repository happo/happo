import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  applyHooks,
  defaultDecorateStory,
  HooksContext,
  mockChannel,
  setChannel,
} from 'storybook/internal/preview-api';

import withHappo from '../decorator.ts';

/**
 * A stand-in for whatever a non-React renderer's story function returns: a Lit
 * `TemplateResult`, a Vue vnode, a DOM node. The decorator has no business
 * knowing which, and what these tests pin down is that it hands the value back
 * untouched.
 *
 * It used to wrap the story in a React element instead. Under `@storybook/react`
 * that worked; under every other renderer the element reached a template that
 * could not render it and was stringified into the page as `[object Object]`,
 * replacing every screenshot in the report with those 15 characters.
 */
const STORY_OUTPUT = { _$litType$: 1, strings: [''], values: [] };

function renderWithDecorator(
  parameters: Record<string, unknown>,
  storyOutput: unknown = STORY_OUTPUT,
) {
  setChannel(mockChannel());

  const decorated = applyHooks(defaultDecorateStory)(() => storyOutput, [
    withHappo,
  ]);

  return decorated({
    parameters,
    hooks: new HooksContext(),
    // Enough of a StoryContext for Storybook's hook bookkeeping; the decorator
    // itself only reads `parameters`.
    id: 'component--story',
    name: 'Story',
    title: 'Component',
    componentId: 'component',
    kind: 'Component',
    story: 'Story',
    args: {},
    argTypes: {},
    globals: {},
    initialArgs: {},
    viewMode: 'story',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe('withHappo', () => {
  it('returns the story output untouched', () => {
    const result = renderWithDecorator({ happo: { delay: 100 } });

    assert.strictEqual(result, STORY_OUTPUT);
  });

  it('returns the story output untouched when there are no happo params', () => {
    const result = renderWithDecorator({});

    assert.strictEqual(result, STORY_OUTPUT);
  });

  it('returns the story output untouched when happo params hold functions', () => {
    const result = renderWithDecorator({
      happo: { beforeScreenshot: () => {}, delay: 200 },
    });

    assert.strictEqual(result, STORY_OUTPUT);
  });

  it('passes a string story output straight through', () => {
    const result = renderWithDecorator({ happo: {} }, '<div>hello</div>');

    assert.strictEqual(result, '<div>hello</div>');
  });

  it('passes a DOM-node-shaped story output straight through', () => {
    const node = { nodeType: 1, tagName: 'DIV' };

    const result = renderWithDecorator({ happo: {} }, node);

    assert.strictEqual(result, node);
  });
});
