import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'node:test';

import happoStorybookPlugin from '../index.ts';

it('removes the project.json after build', async () => {
  const result = await happoStorybookPlugin({
    configDir: 'src/storybook/__tests__/storybook-app',
  });
  assert.strictEqual(fs.existsSync(path.join(result, 'project.json')), false);
});
