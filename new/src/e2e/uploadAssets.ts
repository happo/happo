import retry from 'async-retry';

import { logTag } from '../utils/Logger.ts';
import makeRequest from '../utils/makeRequest.ts';

// Type definitions
interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
}

interface UploadAssetsOptions {
  hash: string;
  endpoint: string;
  apiKey: string;
  apiSecret: string;
  logger: Logger;
  project?: string | undefined;
}

interface AssetsDataResponse {
  path: string;
  uploadedAt: string;
}

interface SignedUrlResponse {
  path?: string;
  signedUrl?: string;
}

interface FinalizeResponse {
  path: string;
}

/**
 * Uploads assets via Happo's API
 *
 * @returns The URL of the uploaded assets
 */
async function uploadAssetsThroughHappo(
  buffer: Buffer<ArrayBuffer>,
  { hash, endpoint, apiKey, apiSecret, logger, project }: UploadAssetsOptions,
): Promise<string> {
  try {
    // Check if the assets already exist. If so, we don't have to upload them.
    const assetsDataRes = (await makeRequest(
      {
        url: `${endpoint}/api/snap-requests/assets-data/${hash}`,
        method: 'GET',
        json: true,
      },
      { apiKey, apiSecret },
    )) as AssetsDataResponse;
    logger.info(
      `${logTag(project)}Reusing existing assets at ${
        assetsDataRes.path
      } (previously uploaded on ${assetsDataRes.uploadedAt})`,
    );
    return assetsDataRes.path;
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number; stack?: string };
    if (err.statusCode !== 404) {
      logger.warn(
        `${logTag(
          project,
        )}Assuming assets don't exist since we got error response: ${
          err.statusCode
        } - ${err.message} - ${err.stack}`,
      );
    }
  }

  const assetsRes = (await makeRequest(
    {
      url: `${endpoint}/api/snap-requests/assets/${hash}`,
      method: 'POST',
      json: true,
      formData: {
        payload: new File([buffer], 'payload.zip', { type: 'application/zip' }),
      },
    },
    { apiKey, apiSecret, retryCount: 2 },
  )) as { path: string };

  return assetsRes.path;
}

/**
 * Uploads assets via signed URL
 *
 * @returns The URL of the uploaded assets
 */
async function uploadAssetsWithSignedUrl(
  buffer: Buffer<ArrayBuffer>,
  { hash, endpoint, apiKey, apiSecret, logger, project }: UploadAssetsOptions,
): Promise<string> {
  // First we need to get the signed URL from Happo.
  const signedUrlRes = (await makeRequest(
    {
      url: `${endpoint}/api/snap-requests/assets/${hash}/signed-url`,
      method: 'GET',
      json: true,
    },
    { apiKey, apiSecret, retryCount: 3 },
  )) as SignedUrlResponse;

  if (!signedUrlRes) {
    throw new Error('Failed to get signed URL');
  }

  // If the asset has already been uploaded, we can return the path now.
  if (signedUrlRes.path) {
    logger.info(`${logTag(project)}Reusing existing assets at ${signedUrlRes.path}`);
    return signedUrlRes.path;
  }

  // Upload the assets to the signed URL using node's built-in fetch with
  // retries
  await retry(
    async (bail: (error: Error) => void) => {
      const res = await fetch(signedUrlRes.signedUrl!, {
        method: 'PUT',
        body: buffer,
        headers: {
          'Content-Type': 'application/zip',
        },
      });

      if (!res.ok) {
        const error = new Error(
          `Failed to upload assets to S3 signed URL: ${res.status} ${res.statusText}`,
        );

        if (res.status < 500 || res.status >= 600) {
          // If it's not a 5xx error, bail immediately instead of retrying
          bail(error);
          return;
        }

        throw error;
      }

      return res;
    },
    {
      retries: 3,
      onRetry: (error: Error, attempt: number) => {
        logger.warn(
          `${logTag(project)}PUT request attempt ${attempt} failed: ${error.message}. Retrying...`,
        );
      },
    },
  );

  // Finally, we need to tell Happo that we've uploaded the assets.
  const finalizeRes = (await makeRequest(
    {
      url: `${endpoint}/api/snap-requests/assets/${hash}/signed-url/finalize`,
      method: 'POST',
      json: true,
    },
    { apiKey, apiSecret, retryCount: 3 },
  )) as FinalizeResponse;

  return finalizeRes.path;
}

export default async function uploadAssets(
  buffer: Buffer<ArrayBuffer>,
  options: UploadAssetsOptions,
): Promise<string> {
  if (process.env.HAPPO_SIGNED_URL) {
    return uploadAssetsWithSignedUrl(buffer, options);
  }

  return uploadAssetsThroughHappo(buffer, options);
}
