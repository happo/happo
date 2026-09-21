import assert from 'node:assert';
import { afterEach, describe, it } from 'node:test';

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

describe('semver-shaped specifiers are read directly', () => {
  // These never need node_modules — the declared range already tells us the
  // major.
  const cases: Array<[string, number]> = [
    ['^9.0.0', 9],
    ['~7.1.0', 7],
    ['>=8.0.0', 8],
    ['>= 8.0.0', 8],
    ['>=8.0.0 <9.0.0', 8],
    ['9.0.0 || 10.0.0', 9],
    ['v9.0.0', 9],
    ['8.0.0-alpha.1', 8],
    ['9.x', 9],
    ['9', 9],
  ];

  for (const [declared, expected] of cases) {
    it(`reads ${expected} from "${declared}"`, () => {
      tmpfs.mock({
        'package.json': JSON.stringify({
          name: 'test',
          devDependencies: { storybook: declared },
        }),
      });

      assert.strictEqual(getStorybookVersionFromPackageJson(), expected);
    });
  }
});

describe('non-semver specifiers fall back to the installed version', () => {
  // Every one of these contains digits somewhere. Reading a major out of them
  // is either flat-out wrong ("catalog:react19" -> 19) or right only by
  // coincidence ("catalog:sb9" -> 9), so they must all defer to node_modules.
  // Each case deliberately installs a version that does NOT match the digits
  // in the specifier, so a bogus parse would fail the assertion.
  const cases: Array<[string, string, number]> = [
    ['catalog:react19', '8.2.1', 8],
    ['catalog:sb9', '8.2.1', 8],
    ['npm:storybook@8.6.0', '9.1.10', 9],
    ['file:../forks/storybook-9', '8.6.0', 8],
    ['link:../forks/storybook-9', '8.6.0', 8],
    ['git+https://github.com/storybookjs/storybook.git#v9.0.0', '8.6.0', 8],
    ['github:storybookjs/storybook#v9', '8.6.0', 8],
    ['workspace:^9', '8.6.0', 8],
    ['*', '9.1.10', 9],
    ['latest', '9.1.10', 9],
  ];

  for (const [declared, installed, expected] of cases) {
    it(`reads ${expected} from node_modules for "${declared}"`, () => {
      tmpfs.mock({
        'package.json': JSON.stringify({
          name: 'test',
          devDependencies: { storybook: declared },
        }),
        node_modules: {
          storybook: {
            'package.json': JSON.stringify({
              name: 'storybook',
              version: installed,
            }),
          },
        },
      });

      assert.strictEqual(getStorybookVersionFromPackageJson(), expected);
    });
  }
});

it('throws rather than guessing a major from digits in a named catalog', () => {
  // Regression: "catalog:react19" used to parse as Storybook 19. On a project
  // actually running Storybook 8 that bogus major gets `--preview-only` passed
  // to a build that does not support it, failing the build outright. With
  // nothing installed to fall back to, erroring out is the correct outcome.
  tmpfs.mock({
    'package.json': JSON.stringify({
      name: 'test',
      devDependencies: { storybook: 'catalog:react19' },
    }),
  });

  assert.throws(
    () => getStorybookVersionFromPackageJson(),
    /Unable to determine installed version of storybook/,
  );
});
