import assert from 'node:assert';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { after, before, beforeEach, describe, it, mock } from 'node:test';

import type { ConfigWithDefaults } from '../../config/index.ts';

type MakeHappoAPIRequestImpl = (...args: Array<unknown>) => Promise<unknown>;

let makeHappoAPIRequestImpl: MakeHappoAPIRequestImpl;
const makeHappoAPIRequestMock = mock.fn(async (...args: Array<unknown>) => {
  return await makeHappoAPIRequestImpl(...args);
});

mock.module('../makeHappoAPIRequest.ts', {
  defaultExport: makeHappoAPIRequestMock,
});

let uploadAssets: typeof import('../uploadAssets.ts').default;

let config: ConfigWithDefaults;
let buffer: Buffer<ArrayBuffer>;
let s3Server: http.Server;
let s3Port: number;
let s3ResponseHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

const logger = { info: () => {}, warn: () => {} };

before(async () => {
  s3Server = http.createServer((req, res) => {
    s3ResponseHandler(req, res);
  });

  await new Promise<void>((resolve) => {
    s3Server.listen(0, () => resolve());
  });

  const addr = s3Server.address();
  s3Port = typeof addr === 'object' && addr !== null ? addr.port : 0;

  ({ default: uploadAssets } = await import('../uploadAssets.ts'));
});

after(async () => {
  await new Promise<void>((resolve) => {
    s3Server.close(() => resolve());
  });
});

beforeEach(() => {
  config = {
    endpoint: 'https://happo.io',
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    project: 'test-project',
    githubApiUrl: 'https://api.github.com',
    targets: {},
    integration: {
      type: 'custom',
      build: async () => ({ rootDir: './custom', entryPoint: 'index.js' }),
    },
  };

  buffer = Buffer.from('test content') as Buffer<ArrayBuffer>;
  makeHappoAPIRequestMock.mock.resetCalls();
  makeHappoAPIRequestImpl = async () => {
    throw new Error('makeHappoAPIRequest not configured');
  };
});

describe('uploadAssets', () => {
  describe('when assets are already uploaded', () => {
    it('returns the existing path without uploading', async () => {
      makeHappoAPIRequestImpl = async () => ({ path: '/existing/path.zip' });

      const result = await uploadAssets(buffer, { hash: 'abc123', logger }, config);

      assert.strictEqual(result, '/existing/path.zip');
      // Only the signed-url GET — no S3 PUT, no finalize POST
      assert.strictEqual(makeHappoAPIRequestMock.mock.callCount(), 1);
    });
  });

  describe('when a new upload is needed', () => {
    beforeEach(() => {
      const md5 = createHash('md5').update(buffer).digest('hex');

      let callCount = 0;
      makeHappoAPIRequestImpl = async () => {
        callCount++;
        if (callCount === 1) return { signedUrl: `http://localhost:${s3Port}/upload` };
        return { path: '/new/path.zip' };
      };

      // Default: S3 returns the correct ETag
      s3ResponseHandler = (_req, res) => {
        res.writeHead(200, { etag: `"${md5}"` });
        res.end();
      };
    });

    it('uploads, verifies the ETag, and finalizes', async () => {
      const result = await uploadAssets(buffer, { hash: 'abc123', logger }, config);

      assert.strictEqual(result, '/new/path.zip');
      assert.strictEqual(makeHappoAPIRequestMock.mock.callCount(), 2);
    });

    describe('when S3 returns a wrong ETag', () => {
      beforeEach(() => {
        s3ResponseHandler = (_req, res) => {
          res.writeHead(200, { etag: '"wrong-etag"' });
          res.end();
        };
      });

      it('throws without calling finalize', async () => {
        await assert.rejects(
          uploadAssets(buffer, { hash: 'abc123', logger }, config),
          /S3 upload verification failed/,
        );

        assert.strictEqual(makeHappoAPIRequestMock.mock.callCount(), 1);
      });
    });

    describe('when S3 returns no ETag', () => {
      beforeEach(() => {
        s3ResponseHandler = (_req, res) => {
          res.writeHead(200);
          res.end();
        };
      });

      it('throws without calling finalize', async () => {
        await assert.rejects(
          uploadAssets(buffer, { hash: 'abc123', logger }, config),
          /S3 upload verification failed/,
        );

        assert.strictEqual(makeHappoAPIRequestMock.mock.callCount(), 1);
      });
    });

    describe('when S3 returns a non-OK status', () => {
      beforeEach(() => {
        s3ResponseHandler = (_req, res) => {
          res.writeHead(403);
          res.end();
        };
      });

      it('throws without calling finalize', async () => {
        await assert.rejects(
          uploadAssets(buffer, { hash: 'abc123', logger }, config),
          /Failed to upload assets to S3 signed URL/,
        );

        assert.strictEqual(makeHappoAPIRequestMock.mock.callCount(), 1);
      });
    });
  });
});
