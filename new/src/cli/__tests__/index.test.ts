import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';

import { findConfigFile, loadConfigFile } from '../index.ts';
import { tmpfsMock, tmpfsRestore } from '../../test-utils/tmpfs.ts';

afterEach(() => {
  tmpfsRestore();
});

describe('findConfigFile', () => {
  it('finds happo.config.js', () => {
    tmpfsMock({
      'happo.config.js': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.js'));
  });

  it('finds happo.config.mjs', () => {
    tmpfsMock({
      'happo.config.mjs': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.mjs'));
  });

  it('finds happo.config.cjs', () => {
    tmpfsMock({
      'happo.config.cjs': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.cjs'));
  });

  it('finds happo.config.ts', () => {
    tmpfsMock({
      'happo.config.ts': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.ts'));
  });

  it('finds happo.config.mts', () => {
    tmpfsMock({
      'happo.config.mts': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.mts'));
  });

  it('finds happo.config.cts', () => {
    tmpfsMock({
      'happo.config.cts': '',
    });

    const foundConfigFile = findConfigFile();

    assert.ok(foundConfigFile);
    assert.ok(foundConfigFile.endsWith('/happo.config.cts'));
  });

  it('finds the config file in a parent directory', () => {
    const tmpDir = tmpfsMock({
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
    const tmpDir = tmpfsMock({
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
    const tmpDir = tmpfsMock({
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
    tmpfsMock({});

    assert.throws(() => {
      findConfigFile();
    }, /Happo config file could not be found/);
  });
});

describe('loadConfigFile', () => {
  it('loads the config file', async () => {
    tmpfsMock({
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
