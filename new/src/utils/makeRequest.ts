import type AsyncRetryType from 'async-retry';
import asyncRetry from 'async-retry';
import { SignJWT } from 'jose';
import type { RequestInit } from 'undici';
import { fetch, FormData, ProxyAgent } from 'undici';

import packageJson from '../../package.json' with { type: 'json' };
const { version } = packageJson;

type FormDataValue = string | File | undefined;

interface RequestAttributes {
  url: string;
  method?: string;
  formData?: Record<string, FormDataValue>;
  body?: unknown;
  json?: boolean;
  [key: string]: unknown;
}

interface MakeRequestOptions {
  apiKey: string;
  apiSecret: string;
  retryCount?: number;
  timeout?: number;
  retryMinTimeout?: number;
  retryMaxTimeout?: number;
  maxTries?: number;
}

function prepareFormData(data: Record<string, FormDataValue>): FormData | null {
  if (!data) {
    return null;
  }

  const form = new FormData();

  for (const [key, value] of Object.entries(data)) {
    if (value) {
      form.append(key, value);
    }
  }

  return form;
}

class ErrorWithStatusCode extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export default async function makeRequest(
  requestAttributes: RequestAttributes,
  {
    apiKey,
    apiSecret,
    retryCount = 0,
    timeout = 60_000,
    retryMinTimeout,
    retryMaxTimeout,
  }: MakeRequestOptions,
  { HTTP_PROXY }: NodeJS.ProcessEnv = process.env,
): Promise<object | null> {
  const { url, method = 'GET', formData, body: jsonBody } = requestAttributes;

  const retryOpts: AsyncRetryType.Options = {
    onRetry: (error: unknown) => {
      console.warn(
        `Failed ${method} ${url}. Retrying (at ${new Date().toISOString()}) ...`,
      );
      console.warn(error);
    },
  };

  if (retryCount != null) {
    retryOpts.retries = retryCount;
  }
  if (retryMinTimeout != null) {
    retryOpts.minTimeout = retryMinTimeout;
  }
  if (retryMaxTimeout != null) {
    retryOpts.maxTimeout = retryMaxTimeout;
  }

  const encodedSecret = new TextEncoder().encode(apiSecret);
  // https://github.com/panva/jose/blob/main/docs/classes/jwt_sign.SignJWT.md
  const signed = await new SignJWT({ key: apiKey })
    .setProtectedHeader({ alg: 'HS256', kid: apiKey })
    .sign(encodedSecret);

  return asyncRetry(async () => {
    const start = Date.now();

    // We must avoid reusing FormData instances when retrying requests
    // because they are consumed and cannot be reused.
    // More info: https://github.com/node-fetch/node-fetch/issues/1743
    const body = formData
      ? prepareFormData(formData)
      : jsonBody
        ? JSON.stringify(jsonBody)
        : null;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${signed}`,
      'User-Agent': `happo.io@${version}`,
    };

    if (jsonBody) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const fetchOptions: RequestInit = {
        headers,
        signal: AbortSignal.timeout(timeout),
        ...requestAttributes,
        body,
      };

      if (HTTP_PROXY) {
        fetchOptions.dispatcher = new ProxyAgent(HTTP_PROXY);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new ErrorWithStatusCode(
          `Request to ${method} ${url} failed: ${
            response.status
          } - ${await response.text()}`,
          response.status,
        );
      }

      const result = await response.json();

      if (typeof result !== 'object') {
        throw new TypeError(`Response is not an object: ${JSON.stringify(result)}`);
      }

      return result;
    } catch (maybeError) {
      const error =
        maybeError instanceof Error ? maybeError : new Error(String(maybeError));

      if (error.name === 'TimeoutError') {
        error.message = `Timeout when fetching ${url} using method ${method}`;
      }

      error.message = `${error.message} (took ${Date.now() - start} ms)`;

      throw error;
    }
  }, retryOpts);
}
