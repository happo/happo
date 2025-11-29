import assert from 'node:assert';
import type { Mock } from 'node:test';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

interface Logger {
  log: Mock<Console['log']>;
  error: Mock<Console['error']>;
}

// Mock promptUser module
interface MockPromptUser extends Mock<(message: string) => Promise<void>> {
  shouldReject?: boolean;
  lastMessage?: string;
}

let mockPromptUser: MockPromptUser;
mock.module('../promptUser.ts', {
  defaultExport: (() => {
    mockPromptUser = mock.fn(async (message: string) => {
      // Store the message
      mockPromptUser.lastMessage = message;
      // Reject or resolve based on the flag
      if (mockPromptUser.shouldReject) {
        throw new Error('User cancelled authentication');
      }
    }) as MockPromptUser;
    return mockPromptUser;
  })(),
});

// Mock openBrowser module
interface MockOpenBrowser extends Mock<(url: string) => Promise<void>> {
  lastUrl?: string;
}

let mockOpenBrowser: MockOpenBrowser;
mock.module('../openBrowser.ts', {
  defaultExport: (() => {
    mockOpenBrowser = mock.fn(async (url: string) => {
      // Store the URL that was passed
      mockOpenBrowser.lastUrl = url;
    }) as MockOpenBrowser;
    return mockOpenBrowser;
  })(),
});

let getShortLivedAPIToken: typeof import('../getShortLivedAPIToken.ts').default;
let logger: Logger;
const originalIsTTY = process.stdin.isTTY;

beforeEach(async () => {
  // Reset mocks
  mockPromptUser.mock.resetCalls();
  mockOpenBrowser.mock.resetCalls();
  mockPromptUser.shouldReject = false;

  // Ensure stdin.isTTY is true for tests
  Object.defineProperty(process.stdin, 'isTTY', {
    value: true,
    writable: true,
    configurable: true,
  });

  logger = {
    log: mock.fn(),
    error: mock.fn(),
  };

  // Import the function after mocks are set up
  const module = await import('../getShortLivedAPIToken.ts');
  getShortLivedAPIToken = module.default;
});

afterEach(() => {
  // Restore original isTTY
  Object.defineProperty(process.stdin, 'isTTY', {
    value: originalIsTTY,
    writable: true,
    configurable: true,
  });
});

describe('getShortLivedAPIToken', () => {
  it('returns null when stdin is not a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });

    const result = await getShortLivedAPIToken('https://happo.io', logger);

    assert.strictEqual(result, null);
  });

  it('stops execution when user presses a different key than Enter', async () => {
    const endpoint = 'https://happo.io';

    // Make promptUser reject to simulate user pressing a different key
    mockPromptUser.shouldReject = true;

    await assert.rejects(
      getShortLivedAPIToken(endpoint, logger),
      /User cancelled authentication/,
    );

    // Verify promptUser was called with the correct message
    assert.strictEqual(mockPromptUser.mock.callCount(), 1);
    assert.strictEqual(
      mockPromptUser.mock.calls[0]?.arguments[0],
      'Press <Enter> to authenticate in the browser',
    );

    // Verify that openBrowser was not called (execution stopped)
    assert.strictEqual(mockOpenBrowser.mock.callCount(), 0);
  });

  it('resolves with key and secret when user presses Enter and callback is called', async () => {
    const endpoint = 'https://happo.io';
    const testKey = 'test-api-key';
    const testSecret = 'test-api-secret';

    // Make promptUser resolve to simulate user pressing Enter
    mockPromptUser.shouldReject = false;

    const promise = getShortLivedAPIToken(endpoint, logger);

    // Verify promptUser was called with the correct message
    assert.strictEqual(mockPromptUser.mock.callCount(), 1);
    assert.strictEqual(
      mockPromptUser.mock.calls[0]?.arguments[0],
      'Press <Enter> to authenticate in the browser',
    );

    // Wait for the server to start and openBrowser to be called
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify that openBrowser was called
    assert.strictEqual(mockOpenBrowser.mock.callCount(), 1);
    const authUrl = mockOpenBrowser.mock.calls[0]?.arguments[0] as string;
    assert.ok(authUrl, 'openBrowser should have been called with a URL');
    assert.ok(authUrl.includes(endpoint));
    assert.ok(authUrl.includes('/cli/auth'));

    // Extract the callback URL from the authUrl
    // The authUrl format is: ${endpoint}/cli/auth?callbackUrl=${encodeURIComponent(callbackUrl)}
    const callbackUrlMatch = authUrl.match(/callbackUrl=([^&]+)/);
    assert.ok(callbackUrlMatch, 'callbackUrl should be in the authUrl');
    assert.ok(callbackUrlMatch[1], 'callbackUrl match should have a capture group');
    const callbackUrl = decodeURIComponent(callbackUrlMatch[1]);
    const response = await fetch(
      `${callbackUrl}?key=${testKey}&secret=${testSecret}`,
    );
    assert.strictEqual(response.status, 200);

    // Wait for the promise to resolve
    const result = await promise;

    assert.ok(result);
    assert.strictEqual(result.key, testKey);
    assert.strictEqual(result.secret, testSecret);
  });

  it('handles callback with missing key or secret', async () => {
    const endpoint = 'https://happo.io';

    // Make promptUser resolve to simulate user pressing Enter
    mockPromptUser.shouldReject = false;

    // Start the function
    const promise = getShortLivedAPIToken(endpoint, logger);

    // Wait for the server to start and openBrowser to be called
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get the callback URL from openBrowser call
    assert.strictEqual(mockOpenBrowser.mock.callCount(), 1);
    const authUrl = mockOpenBrowser.mock.calls[0]?.arguments[0] as string;
    const callbackUrlMatch = authUrl.match(/callbackUrl=([^&]+)/);
    assert.ok(callbackUrlMatch);
    assert.ok(callbackUrlMatch[1], 'callbackUrl match should have a capture group');

    const callbackUrl = decodeURIComponent(callbackUrlMatch[1]);

    const response = await fetch(`${callbackUrl}?wrong=param`);
    assert.strictEqual(response.status, 400);

    const result = await promise;
    assert.strictEqual(
      logger.error.mock.calls[0]?.arguments[0],
      'Failed to authenticate: Missing key or secret in callback',
    );
    assert.strictEqual(result, null);
  });
});
