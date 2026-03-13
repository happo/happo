import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { clearTokenCache, getSignedToken } from '../getSignedToken.ts';

beforeEach(() => {
  clearTokenCache();
});

it('returns a token string', async () => {
  const token = await getSignedToken('key', 'secret');
  assert.strictEqual(typeof token, 'string');
  assert.ok(token.length > 0);
});

describe('token caching', () => {
  it('reuses the cached token on subsequent calls', async () => {
    const token1 = await getSignedToken('key', 'secret');
    const token2 = await getSignedToken('key', 'secret');
    assert.strictEqual(token1, token2);
  });

  it('mints separate tokens for different apiKeys', async () => {
    const token1 = await getSignedToken('key1', 'secret');
    const token2 = await getSignedToken('key2', 'secret');
    assert.notStrictEqual(token1, token2);
  });

  it('mints a new token when the apiSecret changes for the same apiKey', async () => {
    const token1 = await getSignedToken('key', 'secret1');
    const token2 = await getSignedToken('key', 'secret2');
    assert.notStrictEqual(token1, token2);
  });

  describe('when close to the token TTL', () => {
    afterEach(() => {
      mock.timers.reset();
    });

    it('mints a new token when within the refresh buffer', async () => {
      mock.timers.enable({ apis: ['Date'], now: 0 });
      const token1 = await getSignedToken('key', 'secret');

      // TTL is 300s, buffer is 30s — advance to 271s elapsed so 29s remain
      mock.timers.tick(271_000);
      const token2 = await getSignedToken('key', 'secret');

      assert.notStrictEqual(token1, token2);
    });

    it('mints a new token when the token has expired', async () => {
      mock.timers.enable({ apis: ['Date'], now: 0 });
      const token1 = await getSignedToken('key', 'secret');

      mock.timers.tick(301_000);
      const token2 = await getSignedToken('key', 'secret');

      assert.notStrictEqual(token1, token2);
    });

    it('reuses the token when well within the TTL', async () => {
      mock.timers.enable({ apis: ['Date'], now: 0 });
      const token1 = await getSignedToken('key', 'secret');

      // Advance to 269s elapsed — 31s remain, which is just above the 30s buffer
      mock.timers.tick(269_000);
      const token2 = await getSignedToken('key', 'secret');

      assert.strictEqual(token1, token2);
    });
  });
});
