import { createHash } from 'node:crypto';

import retry from 'async-retry';

import type { ConfigWithDefaults } from '../config/index.ts';
import type { ArchiveFormat } from '../utils/deterministicArchive.ts';
import { logTag } from '../utils/Logger.ts';
import makeHappoAPIRequest from './makeHappoAPIRequest.ts';

// What Happo has always signed asset uploads with. Servers that predate zstd
// packages don't tell us what to use, so this is also our fallback.
const DEFAULT_CONTENT_TYPE = 'application/zip';

// Type definitions
interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
}

interface UploadAssetsOptions {
  hash: string;
  logger: Logger;
  format: ArchiveFormat;
}

/**
 * Older Happo servers don't know about anything but zip, so we only ask for a
 * different format when we actually produced one. They ignore the unknown
 * query parameter and hand back a zip-flavored signed URL, which still accepts
 * the upload — the worker identifies packages by their magic bytes, not by
 * name — so a new client keeps working against an old server.
 */
function formatQuery(format: ArchiveFormat): string {
  return format === 'zip' ? '' : `?format=${format}`;
}

export default async function uploadAssets(
  buffer: Buffer<ArrayBuffer>,
  options: UploadAssetsOptions,
  config: ConfigWithDefaults,
): Promise<string> {
  const { project } = config;
  const { hash, logger, format } = options;
  const query = formatQuery(format);

  // First we need to get the signed URL from Happo.
  const signedUrlRes = await makeHappoAPIRequest(
    {
      path: `/api/snap-requests/assets/${hash}/signed-url${query}`,
      method: 'GET',
    },
    config,
    { retryCount: 3 },
  );

  if (!signedUrlRes) {
    throw new Error('Failed to get signed URL');
  }

  if ('path' in signedUrlRes) {
    // If the asset has already been uploaded the response will have a path and
    // we can return it now.
    const { path: signedUrlPath } = signedUrlRes;

    logger.info(`${logTag(project)}Reusing existing assets at ${signedUrlPath}`);
    return typeof signedUrlPath === 'string' ? signedUrlPath : String(signedUrlPath);
  }

  if (!('signedUrl' in signedUrlRes)) {
    throw new Error(
      `Signed URL response does not have path or signedUrl. Response: ${JSON.stringify(signedUrlRes, null, 2)}`,
    );
  }

  const { signedUrl } = signedUrlRes;

  // The signed URL commits to a Content-Type, so we have to send back exactly
  // what the server signed with rather than picking one ourselves.
  const contentType =
    'contentType' in signedUrlRes && typeof signedUrlRes.contentType === 'string'
      ? signedUrlRes.contentType
      : DEFAULT_CONTENT_TYPE;

  // Upload the assets to the signed URL using node's built-in fetch with
  // retries
  await retry(
    async (bail: (error: Error) => void) => {
      const res = await fetch(String(signedUrl), {
        method: 'PUT',
        body: buffer,
        headers: {
          'Content-Type': contentType,
        },
        signal: AbortSignal.timeout(60_000),
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

      // Verify the upload succeeded by checking the ETag header. S3 always
      // returns an ETag matching the MD5 of the uploaded content. A firewall
      // or transparent proxy returning a fake 200 will typically not include
      // a correct ETag, catching the case where the payload never reached S3.
      const etag = res.headers.get('etag');
      const expectedEtag = createHash('md5').update(buffer).digest('hex');
      if (!etag || !etag.includes(expectedEtag)) {
        const error = new Error(
          `S3 upload verification failed: expected ETag to include ${expectedEtag}, got ${etag ?? '(none)'}. ` +
            `A firewall may be intercepting the upload.`,
        );
        bail(error);
        return;
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
      path: `/api/snap-requests/assets/${hash}/signed-url/finalize${query}`,
      method: 'POST',
    },
    config,
    { retryCount: 3 },
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
