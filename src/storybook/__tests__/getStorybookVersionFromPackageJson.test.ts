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

describe('the installed version wins over the declared range', () => {
  // A declared range is a bound, not a version, so it can disagree with what
  // is actually on disk in both directions. node_modules is what
  // `storybook build` runs and what the manager addon has to match, so it
  // wins every time.
  const cases: Array<[string, string, number]> = [
    // Range spans more than one major — the declaration never picked a side.
    ['>=8.0.0', '9.1.10', 9],
    ['8 || 9', '9.0.0', 9],
    ['>=8.0.0 <10', '9.1.10', 9],
    // Declaration runs ahead of the install (branch switch without a
    // reinstall, stale lockfile). Reading 9 here would hand `--preview-only`
    // to a v8 CLI and fail the build outright.
    ['^9.0.0', '8.6.0', 8],
    // Even an exact pin loses: `overrides`/`resolutions` can put something
    // else on disk, and only disk knows.
    ['9.1.10', '8.6.0', 8],
    // Agreement case, for the avoidance of doubt.
    ['^8.0.0', '8.6.0', 8],
  ];

  for (const [declared, installed, expected] of cases) {
    it(`reads ${expected} for declared "${declared}" with ${installed} installed`, () => {
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

describe('falls back to the declared range when nothing resolves off disk', () => {
  // No node_modules at all — this is the Yarn PnP-without-hooks shape, where
  // the declaration is the only signal we have left.
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

describe('non-semver specifiers never yield a major on their own', () => {
  // Every one of these contains digits somewhere, and an unanchored digit
  // match would pull a major out of them — flat-out wrong for
  // "catalog:react19" (-> 19), right only by coincidence for "catalog:sb9".
  // With nothing installed to fall back to there is no answer to give, so
  // throwing is the correct outcome. These fixtures deliberately have no
  // node_modules: an installed version would mask the declaration entirely
  // and the assertion would pass no matter how the specifier parsed.
  const specifiers = [
    'catalog:react19',
    'catalog:sb9',
    'npm:storybook@8.6.0',
    'file:../forks/storybook-9',
    'link:../forks/storybook-9',
    'git+https://github.com/storybookjs/storybook.git#v9.0.0',
    'github:storybookjs/storybook#v9',
    'workspace:^9',
    '*',
    'latest',
  ];

  for (const declared of specifiers) {
    it(`throws rather than guessing a major from "${declared}"`, () => {
      tmpfs.mock({
        'package.json': JSON.stringify({
          name: 'test',
          devDependencies: { storybook: declared },
        }),
      });

      assert.throws(
        () => getStorybookVersionFromPackageJson(),
        /Unable to determine installed version of storybook/,
      );
    });
  }

  it('resolves them from node_modules when the package is installed', () => {
    tmpfs.mock({
      'package.json': JSON.stringify({
        name: 'test',
        devDependencies: { storybook: 'catalog:react19' },
      }),
      node_modules: {
        storybook: {
          'package.json': JSON.stringify({
            name: 'storybook',
            version: '8.2.1',
          }),
        },
      },
    });

    assert.strictEqual(getStorybookVersionFromPackageJson(), 8);
  });
});
