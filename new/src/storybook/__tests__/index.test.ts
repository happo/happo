import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'node:test';

import happoStorybookPlugin from '../index.ts';

it('removes the project.json after build', async () => {
  const result = await happoStorybookPlugin().generateStaticPackage();
  assert.strictEqual(fs.existsSync(path.join(result.path, 'project.json')), false);
});
