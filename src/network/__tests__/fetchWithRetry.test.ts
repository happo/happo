import assert from 'node:assert';

import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import fetchWithRetry from '../fetchWithRetry.ts';

const logger = {
  log: vi.fn(),
  error: vi.fn(),
};

let fetchMock: Mock<typeof fetch>;

beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function sentHeaders(callIndex: number): Record<string, string> {
  const init = fetchMock.mock.calls[callIndex]?.[1];
  assert.ok(init);
  return init.headers as Record<string, string>;
}

describe('when headers is a function', () => {
  it('resolves the headers again for every attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('Nope', { status: 500 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    let calls = 0;
    const headers = vi.fn(async () => {
      calls += 1;
      return { Authorization: `Bearer token-${calls}` };
    });

    const response = await fetchWithRetry(
      'http://localhost/foo',
      { headers, retryCount: 1, retryMinTimeout: 0, retryMaxTimeout: 1 },
      logger,
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(headers.mock.calls.length, 2);
    assert.strictEqual(sentHeaders(0).Authorization, 'Bearer token-1');
    assert.strictEqual(sentHeaders(1).Authorization, 'Bearer token-2');
  });
});

describe('when headers is an object', () => {
  it('sends the headers without mutating the caller object', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const headers = { 'X-Foo': 'bar' };

    await fetchWithRetry(
      'http://localhost/foo',
      { method: 'POST', headers, body: { foo: 'bar' } },
      logger,
    );

    assert.deepStrictEqual(headers, { 'X-Foo': 'bar' });
    assert.strictEqual(sentHeaders(0)['X-Foo'], 'bar');
    assert.strictEqual(sentHeaders(0)['Content-Type'], 'application/json');
  });
});
