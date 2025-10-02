import fs from 'node:fs';
import path from 'node:path';

export default function getStorybookVersionFromPackageJson(
  packageJsonPath: string = path.join(process.cwd(), 'package.json'),
): number {
  const data = fs.readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(data);

  const combinedDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const storybookPackage = [
    'storybook',
    '@storybook/react',
    '@storybook/angular',
    '@storybook/vue',
  ].find((pkg) => combinedDependencies[pkg]);

  if (storybookPackage) {
    const storybookVersion = combinedDependencies[storybookPackage];
    const majorVersion = Number.parseInt(storybookVersion.match(/\d/)[0], 10);
    return majorVersion;
  } else {
    throw new Error('Storybook is not listed as a dependency in package.json');
  }
}
