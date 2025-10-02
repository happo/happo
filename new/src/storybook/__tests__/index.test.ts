import fs from 'node:fs';
import path from 'node:path';

import happoStorybookPlugin from '../index.ts';

jest.setTimeout(60_000);

it('removes the project.json after build', async () => {
  const result = await happoStorybookPlugin().generateStaticPackage();
  expect(fs.existsSync(path.join(result.path, 'project.json'))).toBeFalsy();
});
