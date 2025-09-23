import { describe, it } from 'node:test';
import assert from 'node:assert';

import { defineConfig } from '../index.ts';
import type { Config } from '../index.ts';

describe('defineConfig', () => {
  it('defines a config', () => {
    const configOptions: Config = {
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',

      targets: {},
    };

    const config = defineConfig(configOptions);

    assert.deepStrictEqual(config, configOptions);
  });
});
