import fs from 'node:fs';
import path from 'node:path';

function readInstalledVersion(
  pkg: string,
  projectRoot: string,
): string | undefined {
  try {
    const installedPackageJson = fs.readFileSync(
      path.join(projectRoot, 'node_modules', pkg, 'package.json'),
      'utf8',
    );
    return JSON.parse(installedPackageJson).version;
  } catch {
    return undefined;
  }
}

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

  if (!storybookPackage) {
    throw new Error('Storybook is not listed as a dependency in package.json');
  }

  const declaredVersion: string = combinedDependencies[storybookPackage];
  const declaredMatch = declaredVersion.match(/\d+/);
  if (declaredMatch) {
    return Number.parseInt(declaredMatch[0], 10);
  }

  // The declared dependency is not a plain semver range. This happens with
  // pnpm catalogs ("catalog:", "catalog:foo"), workspace protocols
  // ("workspace:*"), and other non-semver specifiers ("link:", "file:", etc.).
  // Fall back to the version from the installed package in node_modules.
  const installedVersion = readInstalledVersion(
    storybookPackage,
    path.dirname(packageJsonPath),
  );
  const installedMatch = installedVersion?.match(/\d+/);
  if (installedMatch) {
    return Number.parseInt(installedMatch[0], 10);
  }

  throw new Error(
    `Unable to determine Storybook major version (found "${declaredVersion}" for ${storybookPackage} in package.json and no resolvable version in node_modules)`,
  );
}
