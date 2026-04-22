import assert from 'node:assert';
import { afterEach, it } from 'node:test';

import * as tmpfs from '../../test-utils/tmpfs.ts';
import getStorybookVersionFromPackageJson from '../getStorybookVersionFromPackageJson.ts';

afterEach(() => {
  tmpfs.restore();
});

it('finds storybook v9 from package.json', () => {
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'test',
      devDependencies: { storybook: '9.1.10' },
    }),
  });

  const version = getStorybookVersionFromPackageJson();
  assert.strictEqual(version, 9);
});

it('finds storybook v8 from package.json', () => {
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'test',
      devDependencies: { '@storybook/vue': '8.0.0' },
    }),
  });

  const version = getStorybookVersionFromPackageJson();
  assert.strictEqual(version, 8);
});

it('finds storybook v7 from package.json', () => {
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'test',
      devDependencies: { '@storybook/vue': '7.1.0' },
    }),
  });

  const version = getStorybookVersionFromPackageJson();
  assert.strictEqual(version, 7);
});

it('finds storybook from package.json with no dev dependencies', () => {
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'test',
      dependencies: { storybook: '7.1.0' },
    }),
  });

  const version = getStorybookVersionFromPackageJson();
  assert.strictEqual(version, 7);
});

it('throws if storybook is not listed as a dependency', () => {
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'test',
      dependencies: { react: '19.2.0' },
    }),
  });

  assert.throws(() => getStorybookVersionFromPackageJson(), /not listed/);
});

it('resolves version from node_modules when using pnpm catalog:', () => {
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'test',
      devDependencies: { storybook: 'catalog:' },
    }),
    node_modules: {
      storybook: {
        'package.json': JSON.stringify({
          name: 'storybook',
          version: '9.1.10',
        }),
      },
    },
  });

  const version = getStorybookVersionFromPackageJson();
  assert.strictEqual(version, 9);
});

it('resolves version from node_modules when using a named pnpm catalog', () => {
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'test',
      devDependencies: { '@storybook/react': 'catalog:frontend' },
    }),
    node_modules: {
      '@storybook': {
        react: {
          'package.json': JSON.stringify({
            name: '@storybook/react',
            version: '8.2.1',
          }),
        },
      },
    },
  });

  const version = getStorybookVersionFromPackageJson();
  assert.strictEqual(version, 8);
});

it('resolves version from node_modules when using workspace:* protocol', () => {
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'test',
      devDependencies: { storybook: 'workspace:*' },
    }),
    node_modules: {
      storybook: {
        'package.json': JSON.stringify({
          name: 'storybook',
          version: '9.0.0',
        }),
      },
    },
  });

  const version = getStorybookVersionFromPackageJson();
  assert.strictEqual(version, 9);
});

it('throws a helpful error when the declared version is unparseable and the package cannot be resolved', () => {
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'test',
      devDependencies: { storybook: 'catalog:' },
    }),
  });

  assert.throws(
    () => getStorybookVersionFromPackageJson(),
    /Unable to determine Storybook major version/,
  );
});
