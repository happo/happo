import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';

import mime from 'mime-types';

import fetchWithRetry from '../network/fetchWithRetry.ts';
import type { ArchiveContentEntry } from '../utils/deterministicArchive.ts';
import deterministicArchive from '../utils/deterministicArchive.ts';
import makeAbsolute from './makeAbsolute.ts';

// Type definitions
export interface AssetUrl {
  url: string;
  baseUrl?: string | undefined;
  name?: string;
}

function stripQueryParams(url: string): string {
  const i = url.indexOf('?');
  if (i !== -1) {
    return url.slice(0, i);
  }
  return url;
}

function normalize(url: string, baseUrl: string): string {
  if (url.startsWith(baseUrl)) {
    return url.slice(baseUrl.length);
  }
  if (url.startsWith('/')) {
    return url.slice(1);
  }
  if (url.startsWith('../')) {
    return url.slice(3);
  }
  return url;
}

function getFileSuffixFromMimeType(mimeType = ''): string {
  const ext = mime.extension(mimeType);
  if (!ext) {
    return '';
  }
  return `.${ext}`;
}

export default async function createAssetPackage(
  urls: Array<AssetUrl>,
  { downloadAllAssets }: { downloadAllAssets?: boolean },
): Promise<{ buffer: Buffer<ArrayBuffer>; hash: string }> {
  const { HAPPO_DEBUG } = process.env;

  if (HAPPO_DEBUG) {
    console.log(`[HAPPO] Creating asset package from urls`, urls);
  }

  const seenUrls = new Set<string>();

  const archiveFiles: Array<string> = [];
  const archiveContent: Array<ArchiveContentEntry> = [];

  // Get all of the archive items in parallel first. Then add them to the
  // archive serially afterwards to ensure that packages are created
  // deterministically.
  await Promise.all(
    urls.map(async (item: AssetUrl) => {
      const { url, baseUrl } = item;
      const isExternalUrl = /^https?:/.test(url);
      const isLocalhost = /\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url);

      if (!downloadAllAssets && isExternalUrl && !isLocalhost) {
        return;
      }

      const isDynamic = url.includes('?');
      let name =
        isExternalUrl || isDynamic
          ? `_external/${crypto.createHash('md5').update(url).digest('hex')}`
          : normalize(stripQueryParams(url), baseUrl || '');

      if (name.startsWith('#') || name === '' || seenUrls.has(name)) {
        return;
      }

      seenUrls.add(name);

      if (/\.happo-tmp\/_inlined/.test(name)) {
        if (HAPPO_DEBUG) {
          console.log(`[HAPPO] Adding inlined asset ${name}`);
        }

        archiveFiles.push(name);
      } else {
        const fetchUrl = makeAbsolute(url, baseUrl || '');

        if (HAPPO_DEBUG) {
          console.log(
            `[HAPPO] Fetching asset from ${fetchUrl} — storing as ${name}`,
          );
        }

        try {
          const fetchRes = await fetchWithRetry(fetchUrl, { retryCount: 5 });

          const { body } = fetchRes;

          if (!body) {
            throw new Error(`No body for ${fetchUrl}`);
          }

          if (isDynamic || isExternalUrl) {
            // Add a file suffix so that svg images work
            name = `${name}${getFileSuffixFromMimeType(
              fetchRes.headers.get('content-type') || 'image/png',
            )}`;
          }

          // decode URI to make sure "%20" and such are converted to the right
          // chars
          name = decodeURI(name);
          item.name = `/${name}`;

          const content = Readable.fromWeb(
            // Unfortunately, it seems that we need to use a type cast here for
            // now. More info:
            // https://github.com/DefinitelyTyped/DefinitelyTyped/discussions/65542#discussioncomment-6071004
            body as ReadableStream<Uint8Array>,
          );

          archiveContent.push({
            name,
            content,
          });
        } catch (error) {
          console.log(`[HAPPO] Failed to fetch url ${fetchUrl}`);
          console.error(error);
        }
      }
    }),
  );

  return deterministicArchive(archiveFiles, archiveContent);
}
