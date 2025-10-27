import { URL } from 'node:url';

export default function makeAbsolute(url: string, baseUrl: string): string {
  if (url.startsWith('//')) {
    return `${baseUrl.split(':')[0]}:${url}`;
  }
  if (/^https?:/.test(url)) {
    return url;
  }
  return new URL(url, baseUrl).href;
}
