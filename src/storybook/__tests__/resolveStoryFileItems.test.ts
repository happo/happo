import assert from 'node:assert';
import { describe, it } from 'node:test';

import resolveStoryFileItems, {
  type StorybookIndexEntry,
} from '../resolveStoryFileItems.ts';

const entries: Record<string, StorybookIndexEntry> = {
  'button--primary': {
    type: 'story',
    importPath: './src/Button.stories.tsx',
    title: 'Button',
  },
  'button--secondary': {
    type: 'story',
    importPath: './src/Button.stories.tsx',
    title: 'Button',
  },
  'input--default': {
    type: 'story',
    importPath: './src/Input.stories.tsx',
    title: 'Input',
  },
  'card--default': {
    type: 'story',
    importPath: './src/components/Card.stories.tsx',
    title: 'Card',
  },
};

describe('resolveStoryFileItems', () => {
  it('passes through component items unchanged', () => {
    const result = resolveStoryFileItems(
      [{ component: 'Button', variant: 'Primary' }],
      entries,
    );
    assert.deepStrictEqual(result, [{ component: 'Button', variant: 'Primary' }]);
  });

  it('resolves storyFile to component name', () => {
    const result = resolveStoryFileItems(
      [{ storyFile: './src/Button.stories.tsx' }],
      entries,
    );
    assert.deepStrictEqual(result, [{ component: 'Button' }]);
  });

  it('resolves storyFile without leading ./', () => {
    const result = resolveStoryFileItems(
      [{ storyFile: 'src/Input.stories.tsx' }],
      entries,
    );
    assert.deepStrictEqual(result, [{ component: 'Input' }]);
  });

  it('returns one entry per unique component title, not per story', () => {
    // Button has two stories but one title — should produce one resolved item
    const result = resolveStoryFileItems(
      [{ storyFile: 'src/Button.stories.tsx' }],
      entries,
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.component, 'Button');
  });

  it('handles a mix of component and storyFile items', () => {
    const result = resolveStoryFileItems(
      [{ component: 'Card', variant: 'Default' }, { storyFile: 'src/Input.stories.tsx' }],
      entries,
    );
    assert.deepStrictEqual(result, [
      { component: 'Card', variant: 'Default' },
      { component: 'Input' },
    ]);
  });

  it('warns and skips storyFile items not found in the index', () => {
    const warnings: Array<string> = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => { warnings.push(msg); };
    try {
      const result = resolveStoryFileItems(
        [{ storyFile: 'src/NotFound.stories.tsx' }],
        entries,
      );
      assert.deepStrictEqual(result, []);
      assert.strictEqual(warnings.length, 1);
      assert.match(warnings[0] ?? '', /NotFound/);
    } finally {
      console.warn = originalWarn;
    }
  });

  it('returns empty array for empty skip list', () => {
    const result = resolveStoryFileItems([], entries);
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when entries are empty', () => {
    const warnings: Array<string> = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => { warnings.push(msg); };
    try {
      const result = resolveStoryFileItems([{ storyFile: 'src/Button.stories.tsx' }], {});
      assert.deepStrictEqual(result, []);
      assert.strictEqual(warnings.length, 1);
    } finally {
      console.warn = originalWarn;
    }
  });
});
