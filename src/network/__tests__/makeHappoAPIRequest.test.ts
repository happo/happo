import assert from 'node:assert';
import http from 'node:http';
import type { Mock } from 'node:test';
import { after, before, beforeEach, describe, it, mock } from 'node:test';

import multiparty from 'multiparty';

import type { ConfigWithDefaults } from '../../config/index.ts';
import type {
  MakeHappoAPIRequestOptions,
  RequestAttributes,
} from '../makeHappoAPIRequest.ts';
import makeHappoAPIRequest from '../makeHappoAPIRequest.ts';

type FormDataResponse = {
  fields: Record<string, Array<string>>;
  files: Record<
    string,
    Array<{
      fieldName: string;
      headers: Record<string, string>;
      originalFilename: string;
      path: string;
      size: number;
    }>
  >;
};

interface Logger {
  log: Mock<Console['log']>;
  error: Mock<Console['error']>;
}

let logger: Logger;

let props: RequestAttributes;
let options: MakeHappoAPIRequestOptions;
let config: ConfigWithDefaults;

let httpServer: http.Server;
let errorTries: number;

before(async () => {
  logger = {
    log: mock.fn(),
    error: mock.fn(),
  };

  httpServer = http.createServer((req, res) => {
    if (req.url === '/timeout') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            result: 'Hello world!',
          }),
        );
      }, 1000);
      return;
    }

    if (req.url === '/success' || (req.url === '/failure-retry' && errorTries > 2)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          result: 'Hello world!',
        }),
      );
    } else if (
      req.url === '/form-data' ||
      (req.url === '/form-data-failure-retry' && errorTries > 2)
    ) {
      const form = new multiparty.Form();

      form.parse(req, (err, fields, files) => {
        if (err) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end(err.message);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ fields, files }));
      });
    } else if (req.url === '/body-data') {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ body: JSON.parse(data) }));
      });
    } else {
      errorTries += 1;
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Nope');
    }
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(8990, () => resolve());
  });
});

after(async () => {
  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });
});

beforeEach(() => {
  errorTries = 0;
  props = {
    url: 'http://localhost:8990/success',
    method: 'GET',
  };
  options = {
    retryCount: 3,
    retryMinTimeout: 0,
    retryMaxTimeout: 1,
  };
  config = {
    githubApiUrl: 'https://api.github.com',
    targets: {},
    project: 'test',
    integration: {
      type: 'custom',
      build: async () => ({
        rootDir: './custom',
        entryPoint: 'index.js',
      }),
    },
    endpoint: 'http://localhost:8990',
    apiKey: 'foo',
    apiSecret: 'bar',
  };
});

it('returns the response', async () => {
  const response = await makeHappoAPIRequest(props, config, options, logger);
  assert.deepStrictEqual(response, { result: 'Hello world!' });
});

it('can post json', async () => {
  props.url = 'http://localhost:8990/body-data';
  props.method = 'POST';
  props.body = { foo: 'bar' };
  const response = await makeHappoAPIRequest(props, config, options, logger);
  assert.deepStrictEqual(response, { body: { foo: 'bar' } });
});

it('can upload form data with buffers', async () => {
  props.url = 'http://localhost:8990/form-data';
  props.method = 'POST';
  props.formData = {
    type: 'browser-chrome',
    targetName: 'chrome',
    payloadHash: 'foobar',
    payload: new File([Buffer.from('{"foo": "bar"}')], 'payload.json', {
      type: 'application/json',
    }),
  };
  const response = await makeHappoAPIRequest(props, config, options, logger);
  assert.ok(response);
  const responseData = response as FormDataResponse;
  assert.ok(responseData.files.payload);
  assert.ok(responseData.files.payload?.[0]);
  assert.strictEqual(typeof responseData.files.payload[0].path, 'string');
  assert.deepStrictEqual(response, {
    fields: {
      payloadHash: ['foobar'],
      targetName: ['chrome'],
      type: ['browser-chrome'],
    },
    files: {
      payload: [
        {
          fieldName: 'payload',
          headers: {
            'content-disposition':
              'form-data; name="payload"; filename="payload.json"',
            'content-type': 'application/json',
          },
          originalFilename: 'payload.json',
          path: responseData.files.payload?.[0]?.path || '',
          size: 14,
        },
      ],
    },
  });
});

it('can retry uploading form data with buffers', async () => {
  props.url = 'http://localhost:8990/form-data-failure-retry';
  props.method = 'POST';
  props.formData = {
    type: 'browser-chrome',
    targetName: 'chrome',
    payloadHash: 'foobar',
    payload: new File([Buffer.from('{"foo": "bar"}')], 'payload.json', {
      type: 'application/json',
    }),
  };
  const response = await makeHappoAPIRequest(props, config, options, logger);
  assert.ok(response);
  const responseData = response as FormDataResponse;
  assert.ok(responseData.files.payload);
  assert.ok(responseData.files.payload?.[0]);
  assert.strictEqual(typeof responseData.files.payload[0].path, 'string');
  assert.deepStrictEqual(response, {
    fields: {
      payloadHash: ['foobar'],
      targetName: ['chrome'],
      type: ['browser-chrome'],
    },
    files: {
      payload: [
        {
          fieldName: 'payload',
          headers: {
            'content-disposition':
              'form-data; name="payload"; filename="payload.json"',
            'content-type': 'application/json',
          },
          originalFilename: 'payload.json',
          path: responseData.files.payload?.[0]?.path || '',
          size: 14,
        },
      ],
    },
  });
});

describe('when the request fails twice and then succeeds', () => {
  beforeEach(() => {
    props.url = 'http://localhost:8990/failure-retry';
  });

  it('retries and succeeds', async () => {
    const response = await makeHappoAPIRequest(props, config, options, logger);
    assert.deepStrictEqual(response, { result: 'Hello world!' });
  });

  describe('when retryMinTimeout is not set', () => {
    beforeEach(() => {
      // Setting retryCount to 1 so the test doesn't take a long time
      options.retryCount = 1;
      delete options.retryMinTimeout;
      delete options.retryMaxTimeout;
    });

    it('waits the default amount of time before retrying', async () => {
      const start = Date.now();

      await assert.rejects(
        () => makeHappoAPIRequest(props, config, options, logger),
        /Nope/,
      );

      const duration = Date.now() - start;

      // The default timeout is 1000ms, which is defined by the `retry` package.
      assert.ok(duration > 1000);
    });
  });

  describe('when retryCount is not set', () => {
    beforeEach(() => {
      delete options.retryCount;
    });

    it('throws without retrying', async () => {
      await assert.rejects(
        () => makeHappoAPIRequest(props, config, options, logger),
        /Nope/,
      );
    });
  });

  describe('when retryCount is undefined', () => {
    beforeEach(() => {
      delete options.retryCount;
    });

    it('throws without retrying', async () => {
      await assert.rejects(
        () => makeHappoAPIRequest(props, config, options, logger),
        /Nope/,
      );
    });
  });

  describe('when retryCount is 0', () => {
    beforeEach(() => {
      options.retryCount = 0;
    });

    it('throws without retrying', async () => {
      await assert.rejects(
        () => makeHappoAPIRequest(props, config, options, logger),
        /Nope/,
      );
    });
  });
});

describe('can have a timeout', () => {
  it('cancels the request after the allotted time', async () => {
    props.url = 'http://localhost:8990/timeout';
    delete props.method;
    options.timeout = 1;
    options.retryCount = 0;
    await assert.rejects(
      () => makeHappoAPIRequest(props, config, options, logger),
      /Timeout when fetching http:\/\/localhost:8990\/timeout using method GET/,
    );
  });
});

describe('when the request fails repeatedly', () => {
  beforeEach(() => {
    props.url = 'http://localhost:8990/failure';
  });

  it('gives up retrying', async () => {
    await assert.rejects(
      () => makeHappoAPIRequest(props, config, options, logger),
      /Nope/,
    );
  });
});
