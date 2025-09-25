import assert from 'node:assert';
import { afterEach,describe, it } from 'node:test';

import * as tmpfs from '../../test-utils/tmpfs.ts';
import { findConfigFile, loadConfigFile } from '../index.ts';

afterEach(() => {
  tmpfs.restore();
});

describe('findConfigFile', () => {
  it('finds happo.config.js', () => {
    tmpfs.mock({
      'happo.config.js': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.js'));
  });

  it('finds happo.config.mjs', () => {
    tmpfs.mock({
      'happo.config.mjs': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.mjs'));
  });

  it('finds happo.config.cjs', () => {
    tmpfs.mock({
      'happo.config.cjs': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.cjs'));
  });

  it('finds happo.config.ts', () => {
    tmpfs.mock({
      'happo.config.ts': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.ts'));
  });

  it('finds happo.config.mts', () => {
    tmpfs.mock({
      'happo.config.mts': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.mts'));
  });

  it('finds happo.config.cts', () => {
    tmpfs.mock({
      'happo.config.cts': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.cts'));
  });

  it('finds the config file in a parent directory', () => {
    const tmpDir = tmpfs.mock({
      'happo.config.ts': '',
      projects: {
        pizza: {
          'index.ts': '',
        },
      },
    });

    process.chdir(`${tmpDir}/projects/pizza`);

    const foundConfigFile = findConfigFile();
    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith(`${tmpDir}/happo.config.ts`));
  });

  it('finds the config file in a subdirectory', () => {
    const tmpDir = tmpfs.mock({
      'happo.config.ts': '',
      projects: {
        pizza: {
          'happo.config.ts': '',
          'index.ts': '',
        },
      },
    });

    process.chdir(`${tmpDir}/projects/pizza`);

    const foundConfigFile = findConfigFile();
    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith(`${tmpDir}/projects/pizza/happo.config.ts`));
  });

  it('finds the config file in a subdirectory with a different extension', () => {
    const tmpDir = tmpfs.mock({
      'happo.config.js': '',
      projects: {
        pizza: {
          'happo.config.ts': '',
          'index.ts': '',
        },
      },
    });

    process.chdir(`${tmpDir}/projects/pizza`);

    const foundConfigFile = findConfigFile();
    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith(`${tmpDir}/projects/pizza/happo.config.ts`));
  });

  it('throws an error if no config file is found', () => {
    tmpfs.mock({});

    assert.throws(() => {
      findConfigFile();
    }, /Happo config file could not be found/);
  });
});

describe('loadConfigFile', () => {
  it('loads the config file', async () => {
    tmpfs.mock({
      'happo.config.ts': `
        export default {
          apiKey: "test-api-key",
          apiSecret: "test-api-secret"
        };
      `,
    });

    const config = await loadConfigFile(findConfigFile());

    assert.ok(config);
    assert.strictEqual(config.apiKey, 'test-api-key');
    assert.strictEqual(config.apiSecret, 'test-api-secret');
  });
});
