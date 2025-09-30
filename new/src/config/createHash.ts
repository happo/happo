import crypto from 'node:crypto';

/**
 * Creates an MD5 hash of the input string
 * @param input - The string to hash
 * @returns The MD5 hash as a hexadecimal string
 */
export default function createHash(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex');
}
