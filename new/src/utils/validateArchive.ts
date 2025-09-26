import { Readable } from 'node:stream';

/**
 * Validates that the archive was created successfully
 * @param pointer - The archive pointer (bytes written)
 * @param entries - Array of archive entries
 */
export default function validateArchive(pointer: number, entries: unknown[]): void {
  if (pointer === 0) {
    throw new Error('Archive is empty');
  }

  if (entries.length === 0) {
    throw new Error('No entries were added to the archive');
  }
}
