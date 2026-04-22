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

it('resolves version from a parent node_modules (workspace hoisting / Yarn PnP-style walk-up)', () => {
  // The "app" package is nested under packages/app and has no node_modules
  // of its own — storybook is hoisted to the workspace root. Node's module
  // resolution (via createRequire) walks up the tree to find it.
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'workspace-root',
      private: true,
    }),
    node_modules: {
      storybook: {
        'package.json': JSON.stringify({
          name: 'storybook',
          version: '9.2.0',
        }),
      },
    },
    packages: {
      app: {
        'package.json': JSON.stringify({
          name: 'app',
          devDependencies: { storybook: 'catalog:' },
        }),
      },
    },
  });

  const version = getStorybookVersionFromPackageJson(
    tmpfs.fullPath('packages/app/package.json'),
  );
  assert.strictEqual(version, 9);
});

it("falls back to a direct node_modules read when the package's exports field hides package.json", () => {
  // With an exports field that does not list "./package.json",
  // require.resolve('storybook/package.json') throws
  // ERR_PACKAGE_PATH_NOT_EXPORTED. The fallback should still read the file
  // directly off disk.
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'test',
      devDependencies: { storybook: 'catalog:' },
    }),
    node_modules: {
      storybook: {
        'package.json': JSON.stringify({
          name: 'storybook',
          version: '9.3.0',
          exports: { '.': './index.js' },
        }),
        'index.js': '',
      },
    },
  });

  const version = getStorybookVersionFromPackageJson();
  assert.strictEqual(version, 9);
});

it('resolves version when the package is hoisted AND has an exports field that hides package.json', () => {
  // Combination case flagged in review: the package is hoisted to a parent
  // node_modules (so the direct projectRoot/node_modules/<pkg>/package.json
  // fallback misses) AND its exports field does not expose ./package.json
  // (so require.resolve('<pkg>/package.json') throws). The walk-up-from-entry
  // tier must cover this.
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'workspace-root',
      private: true,
    }),
    node_modules: {
      storybook: {
        'package.json': JSON.stringify({
          name: 'storybook',
          version: '9.4.0',
          exports: { '.': './index.js' },
        }),
        'index.js': '',
      },
    },
    packages: {
      app: {
        'package.json': JSON.stringify({
          name: 'app',
          devDependencies: { storybook: 'catalog:' },
        }),
      },
    },
  });

  const version = getStorybookVersionFromPackageJson(
    tmpfs.fullPath('packages/app/package.json'),
  );
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
    /Unable to determine installed version of storybook.*Ensure dependencies are installed/s,
  );
});
