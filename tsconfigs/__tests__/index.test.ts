import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { up as findUp } from 'empathic/find';
import ts from 'typescript';

const tsconfigDirName = 'tsconfigs';

function findRootDir() {
  const packageJson = findUp('package.json', { cwd: import.meta.dirname });

  if (!packageJson) {
    throw new Error('Package.json not found');
  }

  return path.dirname(packageJson);
}

function getAllTsconfigs() {
  const rootDir = findRootDir();
  const tsconfigDir = path.join(rootDir, tsconfigDirName);

  return fs
    .globSync(`${tsconfigDir}/tsconfig.*.json`)
    .map((file) => file.slice(rootDir.length + 1));
}

function readTsconfigJson(tsconfigPath: string): object {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

  if (configFile.error) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext([configFile.error], {
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getCanonicalFileName: (f) => f,
        getNewLine: () => '\n',
      }),
    );
  }

  if (configFile.config === undefined) {
    throw new Error(`Expected config object from ${tsconfigPath}`);
  }

  return configFile.config;
}

function readAndParseTsconfig(tsconfigPath: string): ts.ParsedCommandLine {
  const configDir = path.dirname(tsconfigPath);
  return ts.parseJsonConfigFileContent(
    readTsconfigJson(tsconfigPath),
    ts.sys,
    configDir,
  );
}

function tsconfigListFiles(tsconfigPath: string): Array<string> {
  const parsedConfig = readAndParseTsconfig(tsconfigPath);
  return parsedConfig.fileNames;
}

function isTSConfigForPublishedCode(tsconfigPath: string): boolean {
  return (
    !tsconfigPath.includes('tsconfig.tests.') &&
    !tsconfigPath.includes('tsconfig.dev.')
  );
}

describe('getAllTsConfigs', () => {
  it('returns all *.tsconfig.json files', () => {
    const tsconfigs = getAllTsconfigs();
    assert.ok(tsconfigs.length > 0);
  });
});

describe('tsconfig.json', () => {
  it('extends all other tsconfig.json files', () => {
    const rootDir = findRootDir();
    const rootTsconfig = readAndParseTsconfig(path.join(rootDir, 'tsconfig.json'));

    assert.ok(rootTsconfig.projectReferences);
    const tsconfigPaths = getAllTsconfigs()
      // Remove the base config that everything extends
      .filter(
        (tsconfig) => tsconfig !== path.join(tsconfigDirName, 'tsconfig.base.json'),
      )
      // Normalize the paths to be relative to the tsconfig.json file
      .map((tsconfig) => `./${tsconfig.split(path.sep).join('/')}`);

    assert.ok(rootTsconfig.projectReferences.length === tsconfigPaths.length);

    // parseJsonConfigFileContent resolves project reference paths to absolute paths.
    const referencePaths = rootTsconfig.projectReferences.map(
      (ref) => `./${path.relative(rootDir, ref.path).split(path.sep).join('/')}`,
    );
    assert.deepStrictEqual(referencePaths, tsconfigPaths);
  });
});

describe('tsconfigs', () => {
  it('do have overlapping includes', () => {
    const tsconfigs = getAllTsconfigs();
    const tsconfigFiles = new Map(
      tsconfigs.map((tsconfig) => [tsconfig, new Set(tsconfigListFiles(tsconfig))]),
    );

    for (const [tsconfigFile, files] of tsconfigFiles) {
      for (const [otherTsconfigFile, otherFiles] of tsconfigFiles) {
        if (tsconfigFile !== otherTsconfigFile) {
          const intersection = files
            // @ts-expect-error Set has .intersection but it is not in the type
            // definition yet.
            .intersection(otherFiles);

          assert.ok(
            intersection.size === 0,
            `${tsconfigFile} and ${otherTsconfigFile} intersect. Fix this by adjusting the includes/excludes in the tsconfig files. Intersection: ${JSON.stringify(Array.from(intersection), null, 2)}`,
          );
        }
      }
    }
  });

  it('covers all TypeScript files', () => {
    const rootDir = findRootDir();
    const normalizePath = (file: string): string => {
      const absolute = path.isAbsolute(file) ? file : path.resolve(rootDir, file);
      return path.relative(rootDir, absolute).split(path.sep).join('/');
    };

    const tsconfigs = getAllTsconfigs();
    const filesCoveredByTsconfigs = new Set(
      tsconfigs.flatMap((tsconfig) =>
        tsconfigListFiles(tsconfig).map((file) => normalizePath(file)),
      ),
    );

    const extensions = ['ts', 'tsx', 'mts', 'cts'];
    const srcFiles = new Set(
      fs
        .globSync([
          ...extensions.map((extension) => `*.${extension}`),
          ...extensions.map((extension) => `scripts/**/*.${extension}`),
          ...extensions.map((extension) => `src/**/*.${extension}`),
          ...extensions.map((extension) => `tsconfigs/**/*.${extension}`),
        ])
        .map((file) => normalizePath(file)),
    );

    assert.ok(srcFiles.size > 0);

    const missingFiles = srcFiles
      // @ts-expect-error Set has .difference but it is not in the type yet
      .difference(filesCoveredByTsconfigs);

    assert.ok(
      missingFiles.size === 0,
      `Some files are not covered by any tsconfig file: ${JSON.stringify(Array.from(missingFiles), null, 2)}`,
    );
  });

  it('does not include unexpected files', () => {
    const tsconfigs = getAllTsconfigs();
    const filesCoveredByTsconfigs = new Map(
      tsconfigs.map((tsconfig) => [tsconfig, new Set(tsconfigListFiles(tsconfig))]),
    );

    const bannedDirectories = [
      'coverage',
      'dist',
      'node_modules',
      'playwright-report',
      'test-results',
      'tmp',
      'types',
    ];

    for (const [tsconfigFile, files] of filesCoveredByTsconfigs) {
      for (const file of files) {
        for (const bannedDirectory of bannedDirectories) {
          assert.ok(
            !file.startsWith(`${bannedDirectory}/`),
            `${tsconfigFile} includes ${file}`,
          );
        }
      }
    }
  });

  it('does not allow published code to depend on non-published code', () => {
    const tsconfigs = getAllTsconfigs();

    for (const tsconfig of tsconfigs) {
      if (isTSConfigForPublishedCode(tsconfig)) {
        const parsedConfig = readAndParseTsconfig(tsconfig);

        if (!parsedConfig.projectReferences) {
          continue;
        }

        for (const projectReference of parsedConfig.projectReferences) {
          assert.ok(
            isTSConfigForPublishedCode(projectReference.path),
            `${tsconfig} is published code but depends on ${projectReference.path} which is not published code`,
          );
        }
      }
    }
  });

  it('outputs declaration files for published code to dist directory, everything else to tmp/tsc directory', () => {
    const tsconfigs = getAllTsconfigs();

    for (const tsconfig of tsconfigs) {
      if (path.basename(tsconfig) === 'tsconfig.base.json') {
        continue;
      }

      const parsedConfig = readAndParseTsconfig(tsconfig);
      assert.strictEqual(
        parsedConfig.options.declarationDir,
        isTSConfigForPublishedCode(tsconfig) ? 'dist' : 'tmp/tsc',
        `${tsconfig} outputs declaration files to ${parsedConfig.options.declarationDir}`,
      );
    }
  });
});
