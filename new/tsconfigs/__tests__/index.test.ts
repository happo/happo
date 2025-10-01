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

function tsconfiglistFiles(tsconfigPath: string): Array<string> {
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

  // 3. Return the resolved file list
  return parsedConfig.fileNames;
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
      tsconfigs.map((tsconfig) => [tsconfig, new Set(tsconfiglistFiles(tsconfig))]),
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
});
