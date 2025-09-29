import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';

import type { EntryData } from 'archiver';
import archiver from 'archiver';

import validateArchive from './validateArchive.ts';

// We're setting the creation date to the same for all files so that the zip
// packages created for the same content ends up having the same fingerprint.
const FILE_CREATION_DATE = new Date('Fri Feb 08 2019 13:31:55 GMT+0100 (CET)');

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
  ...dirsAndFiles: string[]
): Promise<FileEntry[]> {
  const files = await Promise.all(
    dirsAndFiles.map((dirOrFile) => resolveFilesRecursiveForDir(dirOrFile)),
  );

  return files.flat();
}

/**
 * Creates a deterministic archive of the given files
 *
 * @param dirsAndFiles - Array of directory and file paths to include
 * @param contentToArchive - Array of content entries to include in the archive
 * @returns Promise resolving to archive result with buffer and hash
 */
export default async function deterministicArchive(
  dirsAndFiles: string[],
  contentToArchive: ArchiveContentEntry[] = [],
): Promise<ArchiveResult> {
  const uniqueDirsAndFiles = Array.from(new Set(dirsAndFiles));

  // Sort by name to make the output deterministic
  const filesToArchiveSorted = (
    await resolveFilesRecursive(...uniqueDirsAndFiles)
  ).toSorted((a, b) => a.name.localeCompare(b.name));

  const contentToArchiveSorted = contentToArchive.toSorted((a, b) =>
    a.name.localeCompare(b.name),
  );

  return new Promise<ArchiveResult>((resolve, reject) => {
    const archive = archiver('zip', {
      // Concurrency in the stat queue leads to non-deterministic output.
      // https://github.com/archiverjs/node-archiver/issues/383#issuecomment-2253139948
      statConcurrency: 1,
      zlib: { level: 6 },
    });

    const stream = new Writable();
    const data: number[] = [];

    stream._write = (chunk: Buffer, _enc: string, done: () => void) => {
      data.push(...chunk);
      done();
    };

    const entries: Array<EntryData> = [];
    archive.on('entry', (entry) => {
      entries.push(entry);
    });

    stream.on('finish', () => {
      validateArchive(archive.pointer(), entries);
      const buffer = Buffer.from(data);
      const hash = crypto.createHash('md5').update(buffer).digest('hex');

      resolve({ buffer, hash });
    });
    archive.pipe(stream);

    const seenFiles = new Set<string>();

    // We can't use archive.directory() here because it is not deterministic.
    // https://github.com/archiverjs/node-archiver/issues/383#issuecomment-2252938075
    for (const file of filesToArchiveSorted) {
      if (!seenFiles.has(file.name)) {
        archive.append(file.stream, {
          name: file.name,
          prefix: '',
          date: FILE_CREATION_DATE,
        });
        seenFiles.add(file.name);
      }
    }

    for (const file of contentToArchiveSorted) {
      if (!seenFiles.has(file.name)) {
        archive.append(file.content, {
          name: file.name,
          prefix: '',
          date: FILE_CREATION_DATE,
        });
        seenFiles.add(file.name);
      }
    }

    archive.on('error', reject);
    archive.finalize();
  });
}
