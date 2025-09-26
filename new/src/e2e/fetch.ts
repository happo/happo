import asyncRetry from 'async-retry';

const { HTTP_PROXY } = process.env;

if (HTTP_PROXY) {
  throw new Error(
    'HTTP_PROXY is not supported yet in the happo library. Reach out to support@happo.io if you need this feature.',
  );
}
interface FetchParams {
  retryCount?: number;
}

export default async function fetch(
  url: string,
  { retryCount = 0 }: FetchParams = {},
): Promise<Response> {
  return asyncRetry(
    async (bail: (error: Error) => void) => {
      const response = await fetch(url);

      if (response.status >= 400 && response.status < 500) {
        bail(
          new Error(
            `[HAPPO] Request to ${url} failed: ${response.status} - ${await response.text()}`,
          ),
        );
        return response;
      }

      if (!response.ok) {
        const error = new Error(
          `[HAPPO] Request to ${url} failed: ${response.status} - ${await response.text()}`,
        ) as Error & { statusCode?: number };
        error.statusCode = response.status;
        throw error; // This will be retried
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
