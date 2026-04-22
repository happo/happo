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

function findPackageJsonForEntry(
  entryPath: string,
  pkg: string,
): string | undefined {
  // Walk up from a resolved entry file to the nearest package.json whose
  // `name` matches `pkg`. Node's resolution always places the entry inside
  // the package's own tree (even under pnpm's .pnpm virtual store or Yarn
  // PnP's zipfs), so this reliably finds the correct root.
  let dir = path.dirname(entryPath);
  while (true) {
    const candidate = path.join(dir, 'package.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (parsed.name === pkg) {
        return candidate;
      }
    } catch {
      // not a readable package.json here; keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
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
  const requireFromProject = createRequire(
    path.join(projectRoot, 'package.json'),
  );

  // Tier 1: resolve `${pkg}/package.json` directly. The happy path for most
  // packages regardless of layout.
  try {
    const version = readVersionFrom(
      requireFromProject.resolve(`${pkg}/package.json`),
    );
    if (version) {
      return version;
    }
  } catch {
    // Packages whose `exports` field does not list `./package.json` make
    // require.resolve throw `ERR_PACKAGE_PATH_NOT_EXPORTED` even when the
    // file exists. Fall through.
  }

  // Tier 2: resolve the package's main entry and walk up to its package.json.
  // Covers the combination of a restrictive `exports` field and a hoisted
  // install (parent node_modules, pnpm virtual store, Yarn PnP zipfs), where
  // neither tier 1 nor the direct lookup below would work.
  try {
    const entryPath = requireFromProject.resolve(pkg);
    const pkgJsonPath = findPackageJsonForEntry(entryPath, pkg);
    if (pkgJsonPath) {
      const version = readVersionFrom(pkgJsonPath);
      if (version) {
        return version;
      }
    }
  } catch {
    // Fall through to the direct node_modules lookup.
  }

  // Tier 3: read node_modules/<pkg>/package.json directly. Belt-and-suspenders
  // for cases where the file exists on disk but require.resolve cannot reach
  // it (e.g. both `.` and `./package.json` hidden behind a restrictive
  // exports map).
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
  const projectRoot = path.dirname(packageJsonPath);
  const installedVersion = readInstalledVersion(storybookPackage, projectRoot);
  const installedMatch = installedVersion?.match(/\d+/);
  if (installedMatch) {
    return Number.parseInt(installedMatch[0], 10);
  }

  throw new Error(
    `Unable to determine installed version of ${storybookPackage} (found "${declaredVersion}" in ${packageJsonPath}). ` +
      `Tried resolving from ${projectRoot} and reading ${path.join(projectRoot, 'node_modules', storybookPackage, 'package.json')}. ` +
      `Ensure dependencies are installed and that ${storybookPackage} is resolvable from that project root.`,
  );
}
