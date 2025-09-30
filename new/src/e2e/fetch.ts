import asyncRetry from 'async-retry';
import type { RequestInit, Response } from 'undici';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

import { ErrorWithStatusCode } from '../utils/makeRequest.ts';

interface FetchParams {
  retryCount?: number;
}

export default async function fetch(
  url: string,
  { retryCount = 0 }: FetchParams = {},
): Promise<Response> {
  return asyncRetry(
    async (bail: (error: Error) => void) => {
      const fetchOptions: RequestInit = {};

      if (process.env.HTTP_PROXY) {
        fetchOptions.dispatcher = new ProxyAgent(process.env.HTTP_PROXY);
      }

      const response = await undiciFetch(url, fetchOptions);

      if (response.status >= 400 && response.status < 500) {
        bail(
          new ErrorWithStatusCode(
            `[HAPPO] Request to ${url} failed: ${response.status} - ${await response.text()}`,
            response.status,
          ),
        );

        return response;
      }

      if (!response.ok) {
        // This will be retried
        throw new ErrorWithStatusCode(
          `[HAPPO] Request to ${url} failed: ${response.status} - ${await response.text()}`,
          response.status,
        );
      }

      return response;
    },

    {
      retries: retryCount,
      onRetry: (error: Error) => {
        console.warn(`[HAPPO] Failed fetching ${url}. Retrying...`);
        console.warn(error);
      },
    },
  );
}
