import assert from 'node:assert';
import path from 'node:path';
import { describe, it } from 'node:test';

import getStorybookVersionFromPackageJson from '../getStorybookVersionFromPackageJson.ts';

describe('with project package.json', () => {
  it('finds the right version', () => {
    const version = getStorybookVersionFromPackageJson();
    assert.strictEqual(version, 9);
  });
});

describe('with storybook 8', () => {
  it('finds the right version', () => {
    const version = getStorybookVersionFromPackageJson(
      path.resolve(__dirname, 'v8-package.json'),
    );
    assert.strictEqual(version, 8);
  });
});

describe('with storybook 7', () => {
  it('finds the right version', () => {
    const version = getStorybookVersionFromPackageJson(
      path.resolve(__dirname, 'v7-package.json'),
    );
    assert.strictEqual(version, 7);
  });
});

describe('with no dev dependencies', () => {
  it('finds the right version', () => {
    const version = getStorybookVersionFromPackageJson(
      path.resolve(__dirname, 'no-devdeps-package.json'),
    );
    assert.strictEqual(version, 7);
  });
});

describe('with no storybook dependencies', () => {
  it('throws', () => {
    assert.throws(
      () =>
        getStorybookVersionFromPackageJson(
          path.resolve(__dirname, 'no-storybook-package.json'),
        ),
      /not listed/,
    );
  });
});
