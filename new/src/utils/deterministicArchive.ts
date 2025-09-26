import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';

import Archiver from 'archiver';
import { glob } from 'glob';

import validateArchive from './validateArchive.ts';

// We're setting the creation date to the same for all files so that the zip
// packages created for the same content ends up having the same fingerprint.
const FILE_CREATION_DATE = new Date('Fri Feb 08 2019 13:31:55 GMT+0100 (CET)');

// Type definitions
interface FileEntry {
  name: string;
  stream: NodeJS.ReadableStream;
}

interface ContentEntry {
  name: string;
  content: string | Buffer | NodeJS.ReadableStream;
}

interface ArchiveResult {
  buffer: Buffer;
  hash: string;
}

/**
 * Resolves all files in a directory and all of its subdirectories
 *
 * @param dirOrFile - The directory or file path to resolve
 * @returns Promise resolving to an array of file entries
 */
async function resolveFilesRecursiveForDir(dirOrFile: string): Promise<FileEntry[]> {
  const resolvedDirOrFile = path.resolve(dirOrFile);
  const isDir = (await fs.promises.lstat(resolvedDirOrFile)).isDirectory();

  if (isDir) {
    const files = await glob('**/*', {
      cwd: resolvedDirOrFile,
      nodir: true,
      absolute: true,
      dot: true,
    });

    return files.map((fullPath: string): FileEntry => {
      return {
        name: path.relative(resolvedDirOrFile, fullPath),
        stream: fs.createReadStream(fullPath),
      };
    });
  }

  return [
    {
      name: path.relative(process.cwd(), resolvedDirOrFile),
      stream: fs.createReadStream(resolvedDirOrFile),
    } as FileEntry,
  ];
}

/**
 * Resolves all files in all directories recursively
 *
 * @param dirsAndFiles - Variable number of directory and file paths
 * @returns Promise resolving to a flattened array of file entries
 */
async function resolveFilesRecursive(
  ...dirsAndFiles: (string | null | undefined)[]
): Promise<FileEntry[]> {
  const files = await Promise.all(
    dirsAndFiles
      .filter(Boolean)
      .map((dirOrFile) => resolveFilesRecursiveForDir(dirOrFile as string)),
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
  dirsAndFiles: (string | null | undefined)[],
  contentToArchive: ContentEntry[] = [],
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
    const archive = new Archiver('zip', {
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

    const entries: unknown[] = [];
    archive.on('entry', (entry: unknown) => {
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
