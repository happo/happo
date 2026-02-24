import asyncRetry from 'async-retry';

import packageJson from '../../package.json' with { type: 'json' };
import type { Logger } from '../isomorphic/types.ts';

const { version } = packageJson;

export class ErrorWithStatusCode extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

type FormDataValue = string | File | undefined;

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

interface FetchParams {
  method?: string;
  headers?: Record<string, string>;
  formData?: Record<string, FormDataValue> | undefined;
  body?: unknown;

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

const defaultHeaders = {
  'User-Agent': `happo@${version}`,
};

export default async function fetchWithRetry(
  url: string | URL,
  {
    method = 'GET',
    headers = {},
    formData,
    body: jsonBody,
    timeout = 60_000,
    retryCount = 0,
    retryMinTimeout = 1000,
    retryMaxTimeout = Infinity,
  }: FetchParams,
  logger: Logger = console,
): Promise<Response> {
  return asyncRetry(
    async (bail: (error: Error) => void) => {
      const start = Date.now();

      // We must avoid reusing FormData instances when retrying requests
      // because they are consumed and cannot be reused.
      // More info: https://github.com/node-fetch/node-fetch/issues/1743
      const body = formData
        ? prepareFormData(formData)
        : jsonBody
          ? JSON.stringify(jsonBody)
          : null;

      if (jsonBody) {
        headers['Content-Type'] = 'application/json';
      }

      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: { ...defaultHeaders, ...headers },
          signal: AbortSignal.timeout(timeout),
          body,
        });
      } catch (maybeError) {
        const originalError =
          maybeError instanceof Error ? maybeError : new Error(String(maybeError));

        const message =
          originalError.name === 'TimeoutError'
            ? `Timeout when fetching ${url} using method ${method}`
            : originalError.message;

        // This WILL be retried
        throw new Error(`${message} (took ${Date.now() - start} ms)`, {
          // eslint-disable-next-line preserve-caught-error -- We actually are preserving the original error, the rule is wrong in this case
          cause: originalError,
        });
      }

      if (response.status >= 400 && response.status < 500) {
        // This WILL NOT be retried
        bail(
          new ErrorWithStatusCode(
            `[HAPPO] Request to ${url} failed: ${response.status} - ${await response.text()}`,
            response.status,
          ),
        );

        return response;
      }

      if (!response.ok) {
        // This WILL be retried
        throw new ErrorWithStatusCode(
          `[HAPPO] Request to ${url} failed: ${response.status} - ${await response.text()}`,
          response.status,
        );
      }

      return response;
    },

    {
      retries: retryCount,
      minTimeout: retryMinTimeout,
      maxTimeout: retryMaxTimeout,
      onRetry: (error: Error) => {
        logger.error(
          `[HAPPO] Failed fetching ${url} using method ${method}. Retrying (at ${new Date().toISOString()}) ...`,
        );
        logger.error(error);
      },
    },
  );
}
