import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import startServer, { type ServerInfo } from '../../network/startServer.ts';
import staticFileHandler from '../staticFileHandler.ts';
import * as tmpfs from '../tmpfs.ts';

let serverInfo: ServerInfo;

beforeEach(async () => {
  tmpfs.mock({
    'index.html': '<h1>Home</h1>',
    'page.html': '<h1>Page</h1>',
    'style.css': 'body { color: red; }',
    'script.js': 'console.log("hi");',
    'image.png': 'PNG',
    'sub folder': {
      'file.html': '<h1>Sub</h1>',
    },
    subdir: {
      'index.html': '<h1>Subdir</h1>',
    },
  });

  serverInfo = await startServer(staticFileHandler(tmpfs.getTempDir()));
});

afterEach(async () => {
  await serverInfo.close();
  tmpfs.restore();
});

async function get(urlPath: string): Promise<Response> {
  return fetch(`http://localhost:${serverInfo.port}${urlPath}`);
}

describe('staticFileHandler', () => {
  it('serves an HTML file', async () => {
    const res = await get('/index.html');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(await res.text(), '<h1>Home</h1>');
  });

  it('serves a CSS file with the correct content-type', async () => {
    const res = await get('/style.css');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/css/);
  });

  it('serves a JS file with the correct content-type', async () => {
    const res = await get('/script.js');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/javascript/);
  });

  it('serves an index.html for a directory path', async () => {
    const res = await get('/subdir/');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '<h1>Subdir</h1>');
  });

  it('serves an index.html for a directory path without a trailing slash', async () => {
    const res = await get('/subdir');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '<h1>Subdir</h1>');
  });

  it('serves an extensionless path by appending .html', async () => {
    const res = await get('/page');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '<h1>Page</h1>');
  });

  it('serves files in URL-encoded paths (spaces)', async () => {
    const res = await get('/sub%20folder/file.html');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '<h1>Sub</h1>');
  });

  it('serves index.html for /', async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '<h1>Home</h1>');
  });

  it('returns 404 for a missing file', async () => {
    const res = await get('/does-not-exist.html');
    assert.equal(res.status, 404);
  });

  it('does not serve files outside the public directory', async () => {
    // The WHATWG URL parser normalizes /../../../etc/passwd to /etc/passwd
    // before our path traversal check, so the result is 404 (not found).
    // The path.resolve + startsWith guard remains as defense-in-depth for
    // callers that bypass HTTP.
    const { connect } = await import('node:net');
    const response = await new Promise<string>((resolve, reject) => {
      const socket = connect(serverInfo.port, 'localhost', () => {
        socket.write(
          'GET /../../../etc/passwd HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n',
        );
      });
      let data = '';
      socket.on('data', (chunk) => (data += chunk.toString()));
      socket.on('end', () => resolve(data));
      socket.on('error', reject);
    });
    assert.match(response, /^HTTP\/1\.1 404/);
  });

  it('returns 400 for a malformed URL', async () => {
    // Send a raw request with a malformed percent-encoded path
    const { connect } = await import('node:net');
    const response = await new Promise<string>((resolve, reject) => {
      const socket = connect(serverInfo.port, 'localhost', () => {
        socket.write(
          'GET /bad%path HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n',
        );
      });
      let data = '';
      socket.on('data', (chunk) => (data += chunk.toString()));
      socket.on('end', () => resolve(data));
      socket.on('error', reject);
    });
    assert.match(response, /^HTTP\/1\.1 400/);
  });

  it('does not serve files via a symlink that points outside the public directory', async () => {
    // Create a directory outside publicDir with a file whose content should
    // never be served.
    const outsideDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'outside')),
    );
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret content');

    try {
      // Place a symlink inside publicDir whose target escapes to outsideDir.
      // The string-based guard allows this because the symlink path itself
      // starts with publicRoot; only a realpath check catches it.
      fs.symlinkSync(outsideDir, path.join(tmpfs.getTempDir(), 'link'));

      const res = await get('/link/secret.txt');
      assert.equal(res.status, 403);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
