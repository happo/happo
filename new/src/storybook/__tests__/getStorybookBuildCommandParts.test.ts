import assert from 'node:assert';
import path from 'node:path';
import { describe, it } from 'node:test';

import getStorybookBuildCommandParts from '../getStorybookBuildCommandParts.ts';

describe('with project package.json', () => {
  it('returns the right command', () => {
    const parts = getStorybookBuildCommandParts();
    assert.deepStrictEqual(parts, ['storybook', 'build']);
  });
});

describe('with a storybook script', () => {
  it.skip('uses binary in node_modules/.bin', () => {
    const parts = getStorybookBuildCommandParts(
      path.resolve(__dirname, 'no-devdeps-package.json'),
    );

    assert.match(parts[0], /node_modules\/\.bin/);
    assert.strictEqual(parts[1], 'build');
  });
});
