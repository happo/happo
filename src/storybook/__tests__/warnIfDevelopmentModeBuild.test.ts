import assert from 'node:assert';
import { afterEach, it, mock } from 'node:test';

import * as tmpfs from '../../test-utils/tmpfs.ts';
import { warnIfDevelopmentModeBuild } from '../index.ts';

afterEach(() => {
  tmpfs.restore();
  mock.restoreAll();
});

function captureWarnings(): Array<string> {
  const warnings: Array<string> = [];
  mock.method(console, 'warn', (...args: Array<unknown>) => {
    warnings.push(args.join(' '));
  });
  return warnings;
}

it('warns when developmentModeForBuild is enabled', async () => {
  tmpfs.mock({
    out: {
      'project.json': JSON.stringify({
        features: { developmentModeForBuild: true },
        framework: { name: '@storybook/react-vite' },
      }),
    },
  });

  const warnings = captureWarnings();
  await warnIfDevelopmentModeBuild(tmpfs.fullPath('out'));

  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0]!, /developmentModeForBuild/);
  assert.match(warnings[0]!, /development build/);
});

it('stays quiet when developmentModeForBuild is absent', async () => {
  tmpfs.mock({
    out: {
      'project.json': JSON.stringify({
        framework: { name: '@storybook/react-vite' },
      }),
    },
  });

  const warnings = captureWarnings();
  await warnIfDevelopmentModeBuild(tmpfs.fullPath('out'));

  assert.deepStrictEqual(warnings, []);
});

it('stays quiet when developmentModeForBuild is explicitly false', async () => {
  tmpfs.mock({
    out: {
      'project.json': JSON.stringify({
        features: { developmentModeForBuild: false },
      }),
    },
  });

  const warnings = captureWarnings();
  await warnIfDevelopmentModeBuild(tmpfs.fullPath('out'));

  assert.deepStrictEqual(warnings, []);
});

it('stays quiet when there is no project.json', async () => {
  tmpfs.mock({ out: { 'iframe.html': '<html></html>' } });

  const warnings = captureWarnings();
  await warnIfDevelopmentModeBuild(tmpfs.fullPath('out'));

  assert.deepStrictEqual(warnings, []);
});

it('stays quiet when project.json is not valid JSON', async () => {
  tmpfs.mock({ out: { 'project.json': 'not json at all' } });

  const warnings = captureWarnings();
  await warnIfDevelopmentModeBuild(tmpfs.fullPath('out'));

  assert.deepStrictEqual(warnings, []);
});
