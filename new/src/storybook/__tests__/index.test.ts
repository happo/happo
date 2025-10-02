const fs = require('node:fs');
const path = require('node:path');

const happoStorybookPlugin = require('../index');

jest.setTimeout(60_000);

it('removes the project.json after build', async () => {
  const result = await happoStorybookPlugin().generateStaticPackage();
  expect(fs.existsSync(path.join(result.path, 'project.json'))).toBeFalsy();
});
