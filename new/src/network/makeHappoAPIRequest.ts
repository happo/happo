import { SignJWT } from 'jose';

import type { Logger } from '../isomorphic/types.ts';
import fetchWithRetry from './fetchWithRetry.ts';
export { ErrorWithStatusCode } from './fetchWithRetry.ts';

type FormDataValue = string | File | undefined;

export interface RequestAttributes {
  url: string;
  method?: string;
  formData?: Record<string, FormDataValue>;
  body?: unknown;
  [key: string]: unknown;
}

export interface MakeHappoAPIRequestOptions {
  /**
   * Happo API key
   */
  apiKey: string;

  /**
   * Happo API secret
   */
  apiSecret: string;

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
  { url, method = 'GET', formData, body }: RequestAttributes,
  {
    apiKey,
    apiSecret,
    retryCount = 0,
    timeout = 60_000,
    retryMinTimeout = 1000,
    retryMaxTimeout = Infinity,
  }: MakeHappoAPIRequestOptions,
  logger: Logger = console,
): Promise<object | null> {
  const signed = await signRequest(apiKey, apiSecret);

  const headers = {
    Authorization: `Bearer ${signed}`,
  };

  const response = await fetchWithRetry(
    url,
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

  // We expect API responses to be JSON, so let's parse it as JSON here for
  // convenience.
  const result = await response.json();

  if (typeof result !== 'object') {
    throw new TypeError(`Response is not an object: ${JSON.stringify(result)}`);
  }

  return result;
}
