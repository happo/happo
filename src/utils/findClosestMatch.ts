function levenshtein(a: string, b: string): number {
  const n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, temp, row[j - 1]!);
      prev = temp;
    }
  }

  return row[n]!;
}

/**
 * Finds the candidate closest to `name`, for "did you mean" suggestions.
 * Returns `undefined` when nothing is close enough to be a likely typo.
 */
export default function findClosestMatch(
  name: string,
  candidates: ReadonlyArray<string>,
): string | undefined {
  let bestMatch: string | undefined;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = levenshtein(name, candidate);
    const threshold = Math.floor(Math.max(name.length, candidate.length) / 3);
    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}
