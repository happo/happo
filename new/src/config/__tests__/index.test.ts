import assert from 'node:assert';
import { describe, it } from 'node:test';

import type { Config } from '../index.ts';
import { defineConfig } from '../index.ts';

describe('defineConfig', () => {
  it('defines a config', () => {
    const configOptions: Config = {
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',

      integration: { type: 'cypress' },
      targets: {},
    };

    const config = defineConfig(configOptions);

    assert.deepStrictEqual(config, configOptions);
  });
});
