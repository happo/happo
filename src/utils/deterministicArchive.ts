import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { Zippable } from 'fflate';
import { zip } from 'fflate';

import createHash from './createHash.ts';
import validateArchive from './validateArchive.ts';

// We're setting the creation date to the same for all files so that the zip
// packages created for the same content ends up having the same fingerprint.
// https://github.com/101arrowz/fflate/issues/219#issuecomment-2333945868
const FILE_CREATION_DATE = new Date(2019, 1, 8, 13, 31, 55);

// Type definitions
interface FileEntry {
  name: string;
  stream: fs.ReadStream;
}

export interface ArchiveContentEntry {
  name: string;
  content: string | Buffer | fs.ReadStream | Readable;
}

interface ArchiveResult {
  buffer: Buffer<ArrayBuffer>;
  hash: string;
}

interface ArchiveEntry {
  name: string;
  size: number;
}

/**
 * Resolves all files in a directory and all of its subdirectories
 *
 * @param dirOrFile - The directory or file path to resolve
 * @returns Promise resolving to an array of file entries
 */
async function resolveFilesRecursiveForDir(
  dirOrFile: string,
): Promise<Array<FileEntry>> {
  const resolvedDirOrFile = path.resolve(dirOrFile);
  const isDir = (await fs.promises.lstat(resolvedDirOrFile)).isDirectory();

  if (isDir) {
    const fileEntries: Array<FileEntry> = [];

    for await (const fileType of fs.promises.glob('**/*', {
      cwd: resolvedDirOrFile,
      withFileTypes: true,
    })) {
      // Check if it's a file (not a directory)
      if (fileType.isFile()) {
        const fullPath = `${fileType.parentPath}/${fileType.name}`;

        fileEntries.push({
          name: path.relative(resolvedDirOrFile, fullPath),
          stream: fs.createReadStream(fullPath),
        });
      }
    }

    return fileEntries;
  }

  return [
    {
      name: path.relative(process.cwd(), resolvedDirOrFile),
      stream: fs.createReadStream(resolvedDirOrFile),
    },
  ];
}

/**
 * Resolves all files in all directories recursively
 *
 * @param dirsAndFiles - Variable number of directory and file paths
 * @returns Promise resolving to a flattened array of file entries
 */
async function resolveFilesRecursive(
  ...dirsAndFiles: Array<string>
): Promise<Array<FileEntry>> {
  const files = await Promise.all(
    dirsAndFiles.map((dirOrFile) => resolveFilesRecursiveForDir(dirOrFile)),
  );

  return files.flat();
}

/**
 * Converts a stream to a Uint8Array
 */
async function streamToUint8Array(
  stream: fs.ReadStream | Readable,
): Promise<Uint8Array> {
  const chunks: Array<Uint8Array> = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  }
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Converts content to Uint8Array
 */
async function contentToUint8Array(
  content: string | Buffer | fs.ReadStream | Readable,
): Promise<Uint8Array> {
  if (typeof content === 'string') {
    return new TextEncoder().encode(content);
  }
  if (Buffer.isBuffer(content)) {
    return new Uint8Array(content);
  }
  return streamToUint8Array(content);
}

/**
 * Creates a deterministic archive of the given files
 *
 * @param dirsAndFiles - Array of directory and file paths to include
 * @param contentToArchive - Array of content entries to include in the archive
 * @returns Promise resolving to archive result with buffer and hash
 */
export default async function deterministicArchive(
  dirsAndFiles: Array<string>,
  contentToArchive: Array<ArchiveContentEntry> = [],
): Promise<ArchiveResult> {
  const uniqueDirsAndFiles = Array.from(new Set(dirsAndFiles));

  // Sort by name to make the output deterministic
  // Use simple string comparison instead of localeCompare for cross-platform determinism
  const filesToArchiveSorted = (
    await resolveFilesRecursive(...uniqueDirsAndFiles)
  ).toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const contentToArchiveSorted = contentToArchive.toSorted((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );

  const seenFiles = new Set<string>();
  const entries: Array<ArchiveEntry> = [];

  // Collect all entries with their data first
  interface EntryData {
    name: string;
    data: Uint8Array;
  }

  const entryDataList: Array<EntryData> = [];

  // Process files from disk
  for (const file of filesToArchiveSorted) {
    if (!seenFiles.has(file.name)) {
      const data = await streamToUint8Array(file.stream);
      entryDataList.push({ name: file.name, data });
      entries.push({ name: file.name, size: data.length });
      seenFiles.add(file.name);
    }
  }

  // Process in-memory content
  // Extract basename to match archiver's behavior with prefix: '' for content entries
  for (const file of contentToArchiveSorted) {
    if (!seenFiles.has(file.name)) {
      const data = await contentToUint8Array(file.content);
      entryDataList.push({ name: file.name, data });
      entries.push({ name: file.name, size: data.length });
      seenFiles.add(file.name);
    }
  }

  // Sort all entries by name to ensure deterministic order
  // Use simple string comparison instead of localeCompare for cross-platform determinism
  entryDataList.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // Build zipData object in sorted order to ensure deterministic zip creation
  const zipData: Zippable = {};
  for (const entry of entryDataList) {
    zipData[entry.name] = [
      entry.data,
      {
        mtime: FILE_CREATION_DATE,
        level: 6,
      },
    ];
  }

  const zipBuffer = await new Promise<Uint8Array>((resolve, reject) => {
    zip(zipData, { level: 6 }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
  const buffer = Buffer.from(zipBuffer);
  validateArchive(buffer.length, entries);
  const hash = createHash(buffer);

  return { buffer, hash };
}
