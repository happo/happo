import retry from 'async-retry';

import makeHappoAPIRequest, {
  ErrorWithStatusCode,
} from '../network/makeHappoAPIRequest.ts';
import { logTag } from '../utils/Logger.ts';

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
    const assetsDataRes = await makeHappoAPIRequest(
      {
        url: `${endpoint}/api/snap-requests/assets-data/${hash}`,
        method: 'GET',
        json: true,
      },
      { apiKey, apiSecret },
    );

    if (!assetsDataRes) {
      throw new Error('Failed to get assets data');
    }

    if (!('path' in assetsDataRes)) {
      throw new Error('Asset data response is missing path');
    }

    if (!('uploadedAt' in assetsDataRes)) {
      throw new Error('Asset data response is missing uploadedAt');
    }

    const { path: uploadedPath, uploadedAt } = assetsDataRes;

    logger.info(
      `${logTag(project)}Reusing existing assets at ${
        uploadedPath
      } (previously uploaded on ${uploadedAt})`,
    );

    return typeof uploadedPath === 'string' ? uploadedPath : String(uploadedPath);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    if (err instanceof ErrorWithStatusCode && err.statusCode !== 404) {
      logger.warn(
        `${logTag(
          project,
        )}Assuming assets don't exist since we got error response: ${
          err.statusCode
        } - ${err.message} - ${err.stack}`,
      );
    }
  }

  const assetsRes = await makeHappoAPIRequest(
    {
      url: `${endpoint}/api/snap-requests/assets/${hash}`,
      method: 'POST',
      json: true,
      formData: {
        payload: new File([buffer], 'payload.zip', { type: 'application/zip' }),
      },
    },
    { apiKey, apiSecret, retryCount: 2 },
  );

  if (!assetsRes) {
    throw new Error('Failed to get assets data');
  }

  if (!('path' in assetsRes)) {
    throw new Error('Asset data response is missing path');
  }

  const { path: assetsPath } = assetsRes;

  return typeof assetsPath === 'string' ? assetsPath : String(assetsPath);
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
  const signedUrlRes = await makeHappoAPIRequest(
    {
      url: `${endpoint}/api/snap-requests/assets/${hash}/signed-url`,
      method: 'GET',
      json: true,
    },
    { apiKey, apiSecret, retryCount: 3 },
  );

  if (!signedUrlRes) {
    throw new Error('Failed to get signed URL');
  }

  if (!('path' in signedUrlRes)) {
    throw new Error('Signed URL response is missing path');
  }

  const { path: signedUrlPath } = signedUrlRes;

  // If the asset has already been uploaded, we can return the path now.
  if (signedUrlPath) {
    logger.info(`${logTag(project)}Reusing existing assets at ${signedUrlPath}`);
    return typeof signedUrlPath === 'string' ? signedUrlPath : String(signedUrlPath);
  }

  if (!('signedUrl' in signedUrlRes)) {
    throw new Error('Signed URL response is missing signedUrl');
  }

  const { signedUrl } = signedUrlRes;

  // Upload the assets to the signed URL using node's built-in fetch with
  // retries
  await retry(
    async (bail: (error: Error) => void) => {
      const res = await fetch(String(signedUrl), {
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
  const finalizeRes = await makeHappoAPIRequest(
    {
      url: `${endpoint}/api/snap-requests/assets/${hash}/signed-url/finalize`,
      method: 'POST',
      json: true,
    },
    { apiKey, apiSecret, retryCount: 3 },
  );

  if (!finalizeRes) {
    throw new Error('Failed to finalize assets');
  }

  if (!('path' in finalizeRes)) {
    throw new Error('Finalize response is missing path');
  }

  const { path: finalizedPath } = finalizeRes;

  return typeof finalizedPath === 'string' ? finalizedPath : String(finalizedPath);
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
