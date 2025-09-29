import crypto from 'node:crypto';

import mime from 'mime-types';

import deterministicArchive from '../utils/deterministicArchive.ts';
import proxiedFetch from './fetch.js';
import makeAbsolute from './makeAbsolute.js';

// Type definitions
interface AssetUrl {
  url: string;
  baseUrl?: string;
  name?: string;
}

interface ArchiveContent {
  name: string;
  content: any; // Response body type
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
  urls: AssetUrl[],
): Promise<{ buffer: Buffer<ArrayBuffer>; hash: string }> {
  const { HAPPO_DOWNLOAD_ALL, HAPPO_DEBUG } = process.env;

  if (HAPPO_DEBUG) {
    console.log(`[HAPPO] Creating asset package from urls`, urls);
  }

  const seenUrls = new Set<string>();

  const archiveFiles: string[] = [];
  const archiveContent: ArchiveContent[] = [];

  // Get all of the archive items in parallel first. Then add them to the
  // archive serially afterwards to ensure that packages are created
  // deterministically.
  await Promise.all(
    urls.map(async (item: AssetUrl) => {
      const { url, baseUrl } = item;
      const isExternalUrl = /^https?:/.test(url);
      const isLocalhost = /\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url);

      if (!HAPPO_DOWNLOAD_ALL && isExternalUrl && !isLocalhost) {
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
          const fetchRes = await proxiedFetch(fetchUrl, { retryCount: 5 });

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

          archiveContent.push({
            name,
            content: fetchRes.body,
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
