import { packTar } from 'modern-tar';

/**
 * Every header field that would otherwise vary is pinned here.
 *
 * The archive is hashed and that hash is what dedupes uploads across machines
 * and CI runs, so the same content has to produce the same bytes everywhere.
 * `modern-tar` defaults `mtime` to the current time, which would quietly make
 * every archive unique — these values are not optional.
 */
const FIXED_HEADER = {
  mtime: new Date(0),
  mode: 0o644,
  uid: 0,
  gid: 0,
  uname: '',
  gname: '',
} as const;

export interface TarEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Builds a deterministic tar archive.
 *
 * Entries are written in the order given — callers are responsible for sorting
 * them. Only regular files are written; directories are implied by the entry
 * paths, which keeps the output free of any ordering ambiguity between a
 * directory and the files inside it.
 *
 * Paths too long for the 100 byte ustar name field are encoded by `modern-tar`
 * (ustar prefix where it fits, PAX otherwise), so no path we can build is
 * rejected here.
 */
export default async function createTar(
  entries: Array<TarEntry>,
): Promise<Buffer<ArrayBuffer>> {
  const packed = await packTar(
    entries.map((entry) => ({
      header: {
        name: entry.name,
        size: entry.data.byteLength,
        type: 'file',
        ...FIXED_HEADER,
      },
      body: entry.data,
    })),
  );

  return Buffer.from(packed) as Buffer<ArrayBuffer>;
}
