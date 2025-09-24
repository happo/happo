export const URL_PATTERN: RegExp = /(url\(['"]?)(.*?)(['"]?\))/g;

export function findCSSAssetUrls(string: string): string[] {
  const result: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(string))) {
    const url = match[2];
    if (url && !url.startsWith('data:')) {
      result.push(url);
    }
  }
  return result;
}
