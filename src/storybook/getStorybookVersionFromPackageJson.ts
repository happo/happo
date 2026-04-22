import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

function readVersionFrom(filePath: string): string | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')).version;
  } catch {
    return undefined;
  }
}

function readInstalledVersion(
  pkg: string,
  projectRoot: string,
): string | undefined {
  // Prefer Node's module resolution so we work with every layout that Node
  // itself understands: flat node_modules (npm/yarn classic), pnpm's symlinked
  // tree, hoisted packages in parent node_modules, and Yarn Plug'n'Play when
  // the process has PnP hooks installed.
  try {
    const requireFromProject = createRequire(
      path.join(projectRoot, 'package.json'),
    );
    const version = readVersionFrom(
      requireFromProject.resolve(`${pkg}/package.json`),
    );
    if (version) {
      return version;
    }
  } catch {
    // Fall through to the direct node_modules lookup below. Some packages
    // have an `exports` field that does not expose `./package.json`, which
    // makes require.resolve throw even when the file exists on disk.
  }

  return readVersionFrom(
    path.join(projectRoot, 'node_modules', pkg, 'package.json'),
  );
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
    `Unable to determine Storybook major version (found "${declaredVersion}" for ${storybookPackage} in package.json and could not resolve the installed package)`,
  );
}
