const BLOCK_SIZE = 512;

// Offsets and lengths of the POSIX ustar header fields we write.
const NAME_LENGTH = 100;
const MODE_OFFSET = 100;
const UID_OFFSET = 108;
const GID_OFFSET = 116;
const SIZE_OFFSET = 124;
const MTIME_OFFSET = 136;
const CHECKSUM_OFFSET = 148;
const CHECKSUM_LENGTH = 8;
const TYPE_FLAG_OFFSET = 156;
const MAGIC_OFFSET = 257;
const VERSION_OFFSET = 263;

const TYPE_FLAG_FILE = '0';
// GNU long name: the body of this entry holds the real name of the entry that
// follows it. Used for paths that don't fit in the 100 byte name field.
const TYPE_FLAG_GNU_LONG_NAME = 'L';
const GNU_LONG_NAME_PLACEHOLDER = '././@LongLink';

// The reader normalizes and then rejects entry paths at 255 characters, so
// there is no point producing anything longer.
const MAX_NAME_LENGTH = 255;

// Every variable field is pinned so that the same content always produces the
// same bytes: the archive is hashed and that hash is what dedupes uploads
// across machines and CI runs.
const FIXED_MODE = '0000644\0';
const FIXED_UID = '0000000\0';
const FIXED_GID = '0000000\0';
const FIXED_MTIME = '00000000000\0';

export interface TarEntry {
  name: string;
  data: Uint8Array;
}

function octal(value: number, length: number): string {
  return `${value.toString(8).padStart(length - 1, '0')}\0`;
}

/**
 * The ustar header checksum is the sum of every byte in the header, computed
 * with the checksum field itself treated as eight spaces.
 */
function writeChecksum(header: Buffer): void {
  header.write(' '.repeat(CHECKSUM_LENGTH), CHECKSUM_OFFSET);

  let sum = 0;
  for (const byte of header) {
    sum += byte;
  }

  // Six octal digits, then NUL, then a space — the conventional encoding.
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, CHECKSUM_OFFSET);
}

function createHeader(name: string, size: number, typeFlag: string): Buffer {
  const header = Buffer.alloc(BLOCK_SIZE);

  header.write(name, 0, NAME_LENGTH, 'utf8');
  header.write(FIXED_MODE, MODE_OFFSET);
  header.write(FIXED_UID, UID_OFFSET);
  header.write(FIXED_GID, GID_OFFSET);
  header.write(octal(size, 12), SIZE_OFFSET);
  header.write(FIXED_MTIME, MTIME_OFFSET);
  header.write(typeFlag, TYPE_FLAG_OFFSET);
  header.write('ustar\u0000', MAGIC_OFFSET); // magic
  header.write('00', VERSION_OFFSET); // version

  writeChecksum(header);

  return header;
}

function padding(size: number): number {
  return (BLOCK_SIZE - (size % BLOCK_SIZE)) % BLOCK_SIZE;
}

/**
 * Builds a deterministic tar archive.
 *
 * Entries are written in the order given — callers are responsible for sorting
 * them. Only regular files are supported; directories are implied by the entry
 * paths, which keeps the output free of any ordering ambiguity between a
 * directory and the files inside it.
 */
export default function createTar(entries: Array<TarEntry>): Buffer {
  const blocks: Array<Buffer> = [];

  for (const entry of entries) {
    const nameBytes = Buffer.byteLength(entry.name, 'utf8');

    if (nameBytes > MAX_NAME_LENGTH) {
      throw new Error(
        `Cannot add "${entry.name}" to the package: the path is too long (${nameBytes} bytes, maximum is ${MAX_NAME_LENGTH}).`,
      );
    }

    if (nameBytes > NAME_LENGTH) {
      // Emit a GNU long name record ahead of the entry itself. The trailing
      // NUL is part of the record.
      const nameData = Buffer.from(`${entry.name}\0`, 'utf8');
      blocks.push(
        createHeader(
          GNU_LONG_NAME_PLACEHOLDER,
          nameData.length,
          TYPE_FLAG_GNU_LONG_NAME,
        ),
        nameData,
        Buffer.alloc(padding(nameData.length)),
      );
    }

    const data = Buffer.from(
      entry.data.buffer,
      entry.data.byteOffset,
      entry.data.byteLength,
    );

    blocks.push(
      createHeader(entry.name, data.length, TYPE_FLAG_FILE),
      data,
      Buffer.alloc(padding(data.length)),
    );
  }

  // Two zero blocks mark the end of the archive.
  blocks.push(Buffer.alloc(BLOCK_SIZE * 2));

  return Buffer.concat(blocks);
}
