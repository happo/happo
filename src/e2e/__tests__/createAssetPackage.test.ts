import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import AdmZip from 'adm-zip';

import type { ServerInfo } from '../../network/startServer.ts';
import startTestServer from '../../test-utils/startTestServer.ts';
import createAssetPackage from '../createAssetPackage.ts';

let serverInfo: ServerInfo;

beforeEach(async () => {
  serverInfo = await startTestServer(`${import.meta.dirname}/fixtures`, 3412);
});

afterEach(async () => {
  await serverInfo.close();
});

describe('createAssetPackage', () => {
  it('creates an asset package', async () => {
    const pkg = await createAssetPackage(
      [
        {
          url: '/sub%20folder/countries-bg.jpeg',
          baseUrl: `http://localhost:${serverInfo.port}`,
        },
        {
          url: `http://localhost:${serverInfo.port}/sub%20folder/countries-bg.jpeg`,
          baseUrl: `http://localhost:${serverInfo.port}`,
        },
        {
          url: `http://localhost:${serverInfo.port}/foo.html`,
          baseUrl: `http://localhost:${serverInfo.port}`,
        },
        {
          url: 'https://happo.io/static/happo-hippo.png',
          baseUrl: `http://localhost:${serverInfo.port}`,
        },
      ],
      { downloadAllAssets: false },
    );

    const zip = new AdmZip(pkg.buffer);
    const entries = zip.getEntries();
    assert.equal(entries.length, 3);
    assert.deepEqual(
      entries.map((e) => e.name),
      [
        '8f037ef4cc4efb6ab6df9cc5d88f7898.jpg',
        'a0f415163499472aab9e93339b832d12.html',
        'countries-bg.jpeg',
      ],
    );
    assert.equal(pkg.hash, '72e01703a28841a98e6f705150c0a06e');
  });

  it('includes external assets when downloadAllAssets is true', async () => {
    const pkg = await createAssetPackage(
      [
        {
          url: '/sub%20folder/countries-bg.jpeg',
          baseUrl: `http://localhost:${serverInfo.port}`,
        },
        {
          url: 'https://happo.io/static/happo-hippo.png',
          baseUrl: `http://localhost:${serverInfo.port}`,
        },
      ],
      { downloadAllAssets: true },
    );

    const zip = new AdmZip(pkg.buffer);
    const entries = zip.getEntries();
    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((e) => e.name),
      ['83112e0c253721ddb1bcff1973e46dcb.png', 'countries-bg.jpeg'],
    );
  });
});
