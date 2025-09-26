import assert from 'node:assert';
import http from 'node:http';
import { afterEach, beforeEach, describe, it } from 'node:test';

import AdmZip from 'adm-zip';
import handler from 'serve-handler';

import createAssetPackage from '../createAssetPackage.js';

// Type definitions
interface AssetUrl {
  url: string;
  baseUrl: string;
}

let server: http.Server;

beforeEach(async () => {
  server = http.createServer(
    (request: http.IncomingMessage, response: http.ServerResponse) => {
      return handler(request, response, { public: 'test-fixtures' });
    },
  );

  await new Promise<void>((resolve) => {
    server.listen(3412, () => {
      console.log('Running at http://localhost:3412');
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(resolve);
  });
});

describe('createAssetPackage', () => {
  it('creates an asset package', async () => {
    const pkg = await createAssetPackage([
      {
        url: '/sub%20folder/countries-bg.jpeg',
        baseUrl: 'http://localhost:3412',
      },
      {
        url: 'http://localhost:3412/sub%20folder/countries-bg.jpeg',
        baseUrl: 'http://localhost:3412',
      },
      {
        url: 'http://localhost:3412/foo.html',
        baseUrl: 'http://localhost:3412',
      },
    ] as AssetUrl[]);

    assert.equal(pkg.hash, '590dc2c60df5591fd9214bbf9a263f79');

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
  });
});
