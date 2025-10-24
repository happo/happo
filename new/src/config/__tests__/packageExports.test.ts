import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import packageJson from '../../../package.json' with { type: 'json' };

function findRootDir() {
  const packageJsonPath = path.resolve(import.meta.dirname, '../../../package.json');
  return path.dirname(packageJsonPath);
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

  it('has existing source files for all exports', () => {
    const exports = packageJson.exports as Record<
      string,
      { default: string; types: string }
    >;

    for (const [exportPath, exportConfig] of Object.entries(exports)) {
      if ('default' in exportConfig) {
        const sourcePath = path.resolve(rootDir, exportConfig.default);
        assert.ok(
          fs.existsSync(sourcePath),
          `Source file for export "${exportPath}" should exist: ${exportConfig.default}`,
        );
      }
    }
  });

  it('has existing type definition files for all exports', () => {
    const exports = packageJson.exports as Record<
      string,
      { default: string; types: string }
    >;

    for (const [exportPath, exportConfig] of Object.entries(exports)) {
      if ('types' in exportConfig) {
        const typesPath = path.resolve(rootDir, exportConfig.types);
        assert.ok(
          fs.existsSync(typesPath),
          `Type definition file for export "${exportPath}" should exist: ${exportConfig.types}`,
        );
      }
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
          sourcePath.endsWith('.ts'),
          `Source file "${sourcePath}" should have .ts extension`,
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
