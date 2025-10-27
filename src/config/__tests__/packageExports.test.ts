import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';

import ts from 'typescript';

import packageJson from '../../../package.json' with { type: 'json' };

function findRootDir() {
  const packageJsonPath = path.resolve(import.meta.dirname, '../../../package.json');
  return path.dirname(packageJsonPath);
}

const parsedTsConfigCache = new Map<string, ts.ParsedCommandLine>();

function parseTsConfig(tsConfigPath: string): ts.ParsedCommandLine {
  if (parsedTsConfigCache.has(tsConfigPath)) {
    return parsedTsConfigCache.get(tsConfigPath)!;
  }

  const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(
      `Failed to read config: ${ts.formatDiagnostic(configFile.error, ts.createCompilerHost({}))}`,
    );
  }

  const parsedCommandLine = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsConfigPath),
  );

  parsedTsConfigCache.set(tsConfigPath, parsedCommandLine);
  return parsedCommandLine;
}

function collectAllTsConfigs(tsConfigPath: string): Set<string> {
  const parsedCommandLine = parseTsConfig(tsConfigPath);

  const tsConfigs = new Set<string>();
  tsConfigs.add(tsConfigPath);

  // Recursively collect project references
  if (parsedCommandLine.projectReferences) {
    for (const projectRef of parsedCommandLine.projectReferences) {
      const projectPath = path.resolve(path.dirname(tsConfigPath), projectRef.path);
      const subConfigs = collectAllTsConfigs(projectPath);
      for (const config of subConfigs) {
        tsConfigs.add(config);
      }
    }
  }

  return tsConfigs;
}

function getAllOutputFilesFromTsConfig(
  tsConfigPath: string,
  rootDir: string,
): Array<string> {
  // First pass: collect all unique tsconfig files
  const allTsConfigs = collectAllTsConfigs(tsConfigPath);

  const allOutputFiles: Set<string> = new Set();

  // Process each tsconfig's files directly using the parsed config.
  // This is much faster than creating a program for each tsconfig.
  for (const configPath of allTsConfigs) {
    const parsedCommandLine = parseTsConfig(configPath);
    const options = parsedCommandLine.options;
    const outDir = options.outDir || '.';
    const declarationDir = options.declarationDir || outDir;

    // Use the fileNames directly from the parsed config
    for (const sourceFileName of parsedCommandLine.fileNames) {
      // Skip declaration files (they don't generate new declarations)
      if (sourceFileName.endsWith('.d.ts')) {
        continue;
      }

      const relativeSourcePath = path.relative(
        options.rootDir || path.dirname(configPath),
        sourceFileName,
      );
      const sourceWithoutExt = relativeSourcePath.replace(/\.ts$/, '');

      if (options.declaration) {
        const declarationPath = path.join(
          declarationDir,
          `${sourceWithoutExt}.d.ts`,
        );

        const relativeDeclarationPath = path.relative(
          rootDir,
          path.resolve(path.dirname(configPath), declarationPath),
        );

        allOutputFiles.add(relativeDeclarationPath);
      }

      if (options.declarationMap) {
        const declarationMapPath = path.join(
          declarationDir,
          `${sourceWithoutExt}.d.ts.map`,
        );

        const relativeDeclarationMapPath = path.relative(
          rootDir,
          path.resolve(path.dirname(configPath), declarationMapPath),
        );

        allOutputFiles.add(relativeDeclarationMapPath);
      }
    }
  }

  return Array.from(allOutputFiles);
}

describe('package.json exports', () => {
  const rootDir = findRootDir();

  it('has exports defined', () => {
    assert.ok(packageJson.exports, 'package.json should have exports field');
    assert.ok(
      typeof packageJson.exports === 'object',
      'exports should be an object',
    );
  });

  it('has valid export paths', () => {
    const exports = packageJson.exports as Record<
      string,
      { default: string; types: string }
    >;

    for (const [exportPath, exportConfig] of Object.entries(exports)) {
      // Check that export path starts with '.' (relative path)
      assert.ok(
        exportPath.startsWith('.'),
        `Export path "${exportPath}" should start with '.'`,
      );

      // Check that export config is an object
      assert.ok(
        typeof exportConfig === 'object',
        `Export config for "${exportPath}" should be an object`,
      );

      // Check that export config has either 'default' or 'types' field
      assert.ok(
        'default' in exportConfig || 'types' in exportConfig,
        `Export config for "${exportPath}" should have 'default' or 'types' field`,
      );
    }
  });

  describe('after build:dist', () => {
    before(() => {
      execSync('pnpm clean && pnpm build:dist');
    });

    it('has a built file for each export', () => {
      const exports = packageJson.exports as Record<
        string,
        { default: string; types: string }
      >;

      for (const [exportPath, exportConfig] of Object.entries(exports)) {
        if ('default' in exportConfig) {
          const sourcePath = path.resolve(rootDir, exportConfig.default);
          assert.ok(
            fs.existsSync(sourcePath),
            `Source file for export "${exportPath}" should exist: ${exportConfig.default} at ${sourcePath}`,
          );
        }
      }
    });
  });

  it('has a type definition file for all exports', () => {
    const mainTsConfigPath = path.resolve(rootDir, 'tsconfig.json');
    const outputFiles = getAllOutputFilesFromTsConfig(mainTsConfigPath, rootDir);
    const typesFilesSet = new Set(
      outputFiles.filter((file) => file.endsWith('.d.ts')),
    );

    const exports = packageJson.exports as Record<
      string,
      { default: string; types: string }
    >;

    const entries = Object.entries(exports);
    assert.ok(entries.length > 0, 'Should have at least one export');

    for (const [exportPath, exportConfig] of entries) {
      assert.ok(
        exportConfig.types,
        `Export "${exportPath}" should have a types field`,
      );

      const expectedTypesFile = path.resolve(rootDir, exportConfig.types);
      const relativePath = path.relative(rootDir, expectedTypesFile);

      assert.ok(
        typesFilesSet.has(relativePath),
        `Type definition file for export "${exportPath}" (${exportConfig.types}) should be generated to the dist directory by TypeScript`,
      );
    }
  });

  it('has no duplicate export paths', () => {
    const exports = packageJson.exports as Record<
      string,
      { default: string; types: string }
    >;
    const exportPaths = Object.keys(exports);
    const uniquePaths = new Set(exportPaths);

    assert.strictEqual(
      exportPaths.length,
      uniquePaths.size,
      'Should not have duplicate export paths',
    );
  });

  it('has proper file extensions in export paths', () => {
    const exports = packageJson.exports as Record<
      string,
      { default: string; types: string }
    >;

    for (const [, exportConfig] of Object.entries(exports)) {
      if ('default' in exportConfig) {
        const sourcePath = exportConfig.default;
        // Source files should have .ts extension
        assert.ok(
          sourcePath.endsWith('.js'),
          `Source file "${sourcePath}" should have .js extension`,
        );
      }

      if ('types' in exportConfig) {
        const typesPath = exportConfig.types;
        // Type definition files should have .d.ts extension
        assert.ok(
          typesPath.endsWith('.d.ts'),
          `Type definition file "${typesPath}" should have .d.ts extension`,
        );
      }
    }
  });
});
