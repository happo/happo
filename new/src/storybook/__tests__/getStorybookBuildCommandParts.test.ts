const path = require('node:path');

const getStorybookBuildCommandParts = require('../getStorybookBuildCommandParts');

describe('with project package.json', () => {
  it('returns the right command', () => {
    const parts = getStorybookBuildCommandParts();
    expect(parts).toEqual(['storybook', 'build']);
  });
});

describe('with a storybook script', () => {
  xit('uses binary in node_modules/.bin', () => {
    const parts = getStorybookBuildCommandParts(
      path.resolve(__dirname, 'no-devdeps-package.json'),
    );
    expect(parts[0]).toMatch(/node_modules\/\.bin/);
    expect(parts[1]).toEqual('build');
  });
});
