import { URL } from 'node:url';

import { URL_PATTERN } from '../isomorphic/findCSSAssetUrls.ts';

export default function makeExternalUrlsAbsolute(
  text: string,
  absUrl: string,
): string {
  return text.replaceAll(URL_PATTERN, (full, pre, url, post) => {
    if (url.startsWith('data:')) {
      return full;
    }
    const fullUrl = new URL(url, absUrl);
    return `${pre}${fullUrl.href}${post}`;
  });
}
