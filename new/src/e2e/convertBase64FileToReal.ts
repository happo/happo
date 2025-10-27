import fs from 'node:fs';

import { Base64Decode } from 'base64-stream';

export default async function convertBase64FileToReal(
  filenameB64: string,
  filename: string,
): Promise<void> {
  const readStream = fs.createReadStream(filenameB64);
  const outStream = fs.createWriteStream(filename, { encoding: undefined });
  const readyPromise = new Promise<void>((resolve, reject) => {
    outStream.on('finish', resolve);
    outStream.on('error', reject);
  });
  readStream.pipe(new Base64Decode()).pipe(outStream);

  await readyPromise;

  // Clean up the base64 file after we're done
  await fs.promises.unlink(filenameB64);
}
