const fs = require('node:fs');
const path = require('node:path');

const { HAPPO_DEBUG } = process.env;

module.exports = function getStorybook7BuildCommandParts(
  packageJsonPath = path.join(process.cwd(), 'package.json'),
) {
  try {
    const data = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(data);

    if (packageJson.scripts.storybook) {
      if (HAPPO_DEBUG) {
        console.log(
          '[happo] Found `storybook` script in package.json. Will attempt to use binary found at `node_modules/.bin/storybook` instead',
        );
      }

      const pathToStorybookCommand = path.join(
        process.cwd(),
        'node_modules',
        '.bin',
        'storybook',
      );

      if (fs.existsSync(pathToStorybookCommand)) {
        return [pathToStorybookCommand, 'build'];
      }
    }
  } catch (e) {
    if (HAPPO_DEBUG) {
      console.log(
        '[happo] Caught error when resolving Storybook build command parts. Will use default.',
        e,
      );
    }
  }

  return ['storybook', 'build'];
};
