import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { up as findUp } from 'empathic/find';
import ts from 'typescript';

import tsconfigJson from '../../tsconfig.json' with { type: 'json' };

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

function readAndParseTsconfig(tsconfigPath: string): ts.ParsedCommandLine {
  // 1. Read the raw JSON from tsconfig
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

  // 2. Parse it into a compiler options + file list
  const configDir = path.dirname(tsconfigPath);
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    configDir,
  );

  return parsedConfig;
}

function tsconfigListFiles(tsconfigPath: string): Array<string> {
  const parsedConfig = readAndParseTsconfig(tsconfigPath);
  return parsedConfig.fileNames;
}

function isTSConfigForPublishedCode(tsconfigPath: string): boolean {
  return (
    !tsconfigPath.includes('tsconfig.tests.') &&
    !tsconfigPath.includes('tsconfig.other.')
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
    const tsconfigPaths = getAllTsconfigs()
      // Remove the base config that everything extends
      .filter((tsconfig) => tsconfig !== `${tsconfigDirName}/tsconfig.base.json`)
      // Normalize the paths to be relative to the tsconfig.json file
      .map((tsconfig) => `./${tsconfig}`);

    assert.ok(tsconfigJson.references.length === tsconfigPaths.length);

    const referencePaths = tsconfigJson.references.map((ref) => ref.path);
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
    const tsconfigs = getAllTsconfigs();
    const filesCoveredByTsconfigs = new Set(
      tsconfigs.flatMap((tsconfig) => tsconfigListFiles(tsconfig)),
    );

    const extensions = ['ts', 'tsx', 'mts', 'cts'];
    const srcFiles = new Set(
      fs.globSync([
        ...extensions.map((extension) => `*.${extension}`),
        ...extensions.map((extension) => `scripts/**/*.${extension}`),
        ...extensions.map((extension) => `src/**/*.${extension}`),
        ...extensions.map((extension) => `tsconfigs/**/*.${extension}`),
      ]),
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

  it('outputs declaration files for published code to types directory, everything else to tmp/tsc directory', () => {
    const tsconfigs = getAllTsconfigs();

    for (const tsconfig of tsconfigs) {
      if (tsconfig.endsWith('/tsconfig.base.json')) {
        continue;
      }

      const parsedConfig = readAndParseTsconfig(tsconfig);
      assert.strictEqual(
        parsedConfig.options.declarationDir,
        isTSConfigForPublishedCode(tsconfig) ? 'types' : 'tmp/tsc',
        `${tsconfig} outputs declaration files to ${parsedConfig.options.declarationDir}`,
      );
    }
  });
});
