import crypto from 'node:crypto';

/**
 * Creates an MD5 hash of the input data
 * @param data - The data to hash (string, Buffer, or TypedArray)
 * @returns The MD5 hash as a hexadecimal string
 */
export default function createHash(
  data: string | Buffer | NodeJS.TypedArray,
): string {
  return crypto.createHash('md5').update(data).digest('hex');
}
