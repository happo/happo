import type { EntryData } from 'archiver';

/**
 * Validates that the archive was created successfully
 * @param pointer - The archive pointer (bytes written)
 * @param entries - Array of archive entries
 */
export default function validateArchive(
  totalBytes: number,
  entries: Array<EntryData | { name: string; size: number }>,
): void {
  const totalMegaBytes = Math.round(totalBytes / 1024 / 1024);

  if (totalMegaBytes < 30) {
    return;
  }

  const messageBits = [
    `Package size is ${totalMegaBytes} MB (${totalBytes} bytes), maximum is 60 MB.`,
    "Here are the largest 20 files in the archive. Consider removing ones that aren't necessary.",
  ];

  const fileSizes = entries.map((entry) => ({
    name: entry.name,
    size:
      'stats' in entry && entry.stats
        ? entry.stats.size
        : 'size' in entry
          ? entry.size
          : 0,
  }));

  for (const file of fileSizes.toSorted((a, b) => b.size - a.size).slice(0, 20)) {
    messageBits.push(
      `${file.name}: ${Math.round(file.size / 1024 / 1024)} MB (${file.size} bytes)`,
    );
  }

  if (totalMegaBytes > 60) {
    throw new Error(messageBits.join('\n'));
  }

  console.warn(messageBits.join('\n'));
}
