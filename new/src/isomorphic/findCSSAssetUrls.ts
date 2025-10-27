const URL_PATTERN: RegExp = /(url\(['"]?)(.*?)(['"]?\))/g;

function findCSSAssetUrls(string: string): Array<string> {
  const result: Array<string> = [];
  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(string))) {
    const url = match[2];
    if (url && !url.startsWith('data:')) {
      result.push(url);
    }
  }
  return result;
}

export { URL_PATTERN };
export default findCSSAssetUrls;
