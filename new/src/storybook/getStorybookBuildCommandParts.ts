import fs from 'node:fs';
import path from 'node:path';

const { HAPPO_DEBUG } = process.env;

export default function getStorybookBuildCommandParts(
  packageJsonPath: string = path.join(process.cwd(), 'package.json'),
): Array<string> {
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
}
