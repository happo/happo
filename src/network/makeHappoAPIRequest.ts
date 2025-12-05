import { SignJWT } from 'jose';

import type { ConfigWithDefaults } from '../config/index.ts';
import type { Logger } from '../isomorphic/types.ts';
import fetchWithRetry from './fetchWithRetry.ts';

export { ErrorWithStatusCode } from './fetchWithRetry.ts';

type FormDataValue = string | File | undefined;

export interface RequestAttributes {
  /**
   * The path to the API endpoint
   *
   * @example
   * '/api/snap-requests/with-results'
   */
  path?: `/api/${string}`;

  /**
   * The URL to fetch
   *
   * Prefer using the `path` property instead. If both are provided, the `path`
   * property will be used.
   */
  url?: string;

  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  formData?: Record<string, FormDataValue>;
  body?: unknown;
  json?: boolean;
}

export interface MakeHappoAPIRequestOptions {
  /**
   * The timeout in milliseconds
   * @default 60_000
   */
  timeout?: number;

  /**
   * The number of times to retry the request
   * @default 0
   */
  retryCount?: number;

  /**
   * The minimum timeout in milliseconds
   * @default 1000
   */
  retryMinTimeout?: number;

  /**
   * The maximum timeout in milliseconds
   * @default Infinity
   */
  retryMaxTimeout?: number;
}

async function signRequest(apiKey: string, apiSecret: string): Promise<string> {
  const encodedSecret = new TextEncoder().encode(apiSecret);
  return await new SignJWT({ key: apiKey })
    .setProtectedHeader({ alg: 'HS256', kid: apiKey })
    .sign(encodedSecret);
}

export default async function makeHappoAPIRequest(
  { url, path, method = 'GET', formData, body }: RequestAttributes,
  { apiKey, apiSecret, endpoint }: ConfigWithDefaults,
  {
    retryCount = 0,
    timeout = 60_000,
    retryMinTimeout = 1000,
    retryMaxTimeout = Infinity,
  }: MakeHappoAPIRequestOptions,
  logger: Logger = console,
): Promise<object | null> {
  const fetchURL = path ? new URL(path, endpoint) : url;

  if (!fetchURL) {
    throw new Error(
      'No fetch URL provided. Either `path` (preferred) or `url` must be provided.',
    );
  }

  const signed = await signRequest(apiKey, apiSecret);

  const headers = {
    Authorization: `Bearer ${signed}`,
  };

  const response = await fetchWithRetry(
    fetchURL,
    {
      method,
      headers,
      formData,
      body,
      timeout,
      retryCount,
      retryMinTimeout,
      retryMaxTimeout,
    },
    logger,
  );

  if (response.status === 204) {
    return null;
  }

  // We expect API responses to be JSON, so let's parse it as JSON here for
  // convenience.
  const result = await response.json();

  if (typeof result !== 'object') {
    throw new TypeError(`Response is not an object: ${JSON.stringify(result)}`);
  }

  return result;
}
