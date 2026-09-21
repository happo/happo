import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import * as walk from 'empathic/walk';

// A specifier is only treated as a version when it actually looks like a
// semver range: an optional range operator, then a major version followed by a
// separator (or nothing at all). Anchoring matters — an unanchored digit match
// would happily read a major out of specifiers that merely *contain* digits,
// e.g. "catalog:react19" (-> 19) or "npm:storybook@8.6.0" (-> 8), and a bogus
// major is worse than no major.
//
// This only ever runs on the fallback path (see below). A declared range is
// not a version even when it is perfectly well formed: ">=8.0.0" says nothing
// about whether 8 or 9 is on disk.
const SEMVER_MAJOR = /^\s*[v=<>~^\s]*(\d+)(?:[.\-+]|\s|$)/;

function parseMajorVersion(version: string | undefined): number | undefined {
  const match = version?.match(SEMVER_MAJOR);
  if (!match?.[1]) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

function readVersionFrom(filePath: string): string | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')).version;
  } catch {
    return undefined;
  }
}

function findPackageJsonForEntryPath(
  entryPath: string,
  pkgName: string,
): string | undefined {
  // Walk up from a resolved entry file to the nearest package.json whose
  // `name` matches `pkgName`. Node's resolution always places the entry inside
  // the package's own tree (even under pnpm's .pnpm virtual store or Yarn
  // PnP's zipfs), so this reliably finds the correct root.
  for (const dir of walk.up(path.dirname(entryPath))) {
    const candidate = path.join(dir, 'package.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (parsed.name === pkgName) {
        return candidate;
      }
    } catch {
      // not a readable package.json here; keep walking up
    }
  }

  return undefined;
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
    const pkgJsonPath = findPackageJsonForEntryPath(entryPath, pkg);
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

  const projectRoot = path.dirname(packageJsonPath);

  // The installed package is the source of truth, because it is the thing
  // every caller actually cares about: `storybook build` runs the installed
  // CLI, and the manager addon we inject has to match the installed module
  // layout ("storybook/internal/manager-api" on v8 vs "storybook/manager-api"
  // on v9+). What package.json declares is only a *range* over that, and the
  // two disagree routinely:
  //
  //   ">=8.0.0"  with 9 installed -> the range says 8, the truth is 9
  //   "^9.0.0"   with 8 installed -> a stale install after a branch switch
  //   "8 || 9"                    -> the range never picked a side
  //
  // plus `overrides` / `resolutions` / patched installs, which a specifier
  // cannot express at all.
  const installedMajor = parseMajorVersion(
    readInstalledVersion(storybookPackage, projectRoot),
  );
  if (installedMajor !== undefined) {
    return installedMajor;
  }

  // Nothing resolved off disk. That is rare and usually means an install we
  // cannot see into rather than a missing dependency — chiefly Yarn Plug'n'Play
  // when our process was started without the PnP hooks, where require.resolve
  // throws and there is no node_modules tree to read either. A declared range
  // is a weaker signal, but it beats refusing to run.
  const declaredVersion: string = combinedDependencies[storybookPackage];
  const declaredMajor = parseMajorVersion(declaredVersion);
  if (declaredMajor !== undefined) {
    return declaredMajor;
  }

  throw new Error(
    `Unable to determine installed version of ${storybookPackage} (found "${declaredVersion}" in ${packageJsonPath}). ` +
      `Tried resolving from ${projectRoot} and reading ${path.join(projectRoot, 'node_modules', storybookPackage, 'package.json')}. ` +
      `Ensure dependencies are installed and that ${storybookPackage} is resolvable from that project root.`,
  );
}
