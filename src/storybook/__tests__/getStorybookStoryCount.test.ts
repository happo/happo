import assert from 'node:assert';
import { afterEach, describe, it } from 'node:test';

import * as tmpfs from '../../test-utils/tmpfs.ts';
import getStorybookStoryCount from '../getStorybookStoryCount.ts';

const indexWithEntries = JSON.stringify({
  v: 5,
  entries: {
    'button--primary': { type: 'story', id: 'button--primary' },
    'button--secondary': { type: 'story', id: 'button--secondary' },
    'button--docs': { type: 'docs', id: 'button--docs' },
    'input--default': { type: 'story', id: 'input--default' },
  },
});

afterEach(() => {
  tmpfs.restore();
});

describe('getStorybookStoryCount', () => {
  it('counts only story-type entries from index.json', async () => {
    const dir = tmpfs.mock({ 'index.json': indexWithEntries });
    const count = await getStorybookStoryCount(dir);
    // 3 stories, 1 docs — only stories counted
    assert.strictEqual(count, 3);
  });

  it('falls back to the stories key for older storybook index format', async () => {
    const dir = tmpfs.mock({
      'index.json': JSON.stringify({
        v: 3,
        stories: {
          'card--default': { type: 'story' },
          'card--docs': { type: 'docs' },
        },
      }),
    });
    const count = await getStorybookStoryCount(dir);
    assert.strictEqual(count, 1);
  });

  it('returns 0 when there are no story entries', async () => {
    const dir = tmpfs.mock({
      'index.json': JSON.stringify({ v: 5, entries: {} }),
    });
    const count = await getStorybookStoryCount(dir);
    assert.strictEqual(count, 0);
  });

  it('returns undefined when index.json does not exist', async () => {
    const dir = tmpfs.mock({});
    const count = await getStorybookStoryCount(dir);
    assert.strictEqual(count, undefined);
  });

  it('returns undefined when index.json is malformed JSON', async () => {
    const dir = tmpfs.mock({ 'index.json': 'not valid json {{{' });
    const count = await getStorybookStoryCount(dir);
    assert.strictEqual(count, undefined);
  });
});
