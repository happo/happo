import asyncRetry from 'async-retry';

import { ErrorWithStatusCode } from '../network/makeHappoAPIRequest.ts';

interface FetchParams {
  retryCount?: number;
}

export default async function fetchWithRetry(
  url: string,
  { retryCount = 0 }: FetchParams = {},
): Promise<Response> {
  return asyncRetry(
    async (bail: (error: Error) => void) => {
      const response = await fetch(url);

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
