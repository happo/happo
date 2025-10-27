export default function chunked(
  string: string,
  charactersPerChunk: number,
): Array<string> {
  if (string.length < charactersPerChunk) {
    // micro-optimization for small lists
    return [string];
  }
  const chunks = [];
  let i = 0;
  while (i < string.length) {
    chunks.push(string.slice(i, (i += charactersPerChunk)));
  }

  return chunks;
}
