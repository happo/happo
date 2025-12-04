import type { Logger } from '../isomorphic/types.ts';
import startServer from '../network/startServer.ts';
import openBrowser from './openBrowser.ts';
import promptUser from './promptUser.ts';

const VALID_HEX_REGEX = /^[0-9a-fA-F]+$/;

function createHTML(endpoint: string, phase: string): string {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <title>Happo CLI Authentication</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <script type="text/javascript">
        const message = { type: 'happo-cli-auth', payload: { phase: '${phase}' } };
        // Use the exact origin of the parent page
        window.parent.postMessage(message, '${endpoint}'); 
      </script>
    </head>
    <body>
      <main>
        <h1>Happo CLI Authentication</h1> 
        <p>Authentication successful!</p>
      </main>
    </body>
  </html>`;
}

function validateKeyAndSecret(args: {
  key: string | null;
  secret: string | null;
}): args is { key: string; secret: string } {
  const { key, secret } = args;
  if (!key) {
    return false;
  }
  if (!secret) {
    return false;
  }
  if (key.length < 10 || key.length > 64) {
    return false;
  }
  if (secret.length < 20 || secret.length > 256) {
    return false;
  }
  // validate that key and secret are valid hex strings
  if (!VALID_HEX_REGEX.test(key)) {
    return false;
  }
  if (!VALID_HEX_REGEX.test(secret)) {
    return false;
  }
  return true;
}

export default async function getShortLivedAPIToken(
  endpoint: string,
  logger: Logger,
): Promise<{ key: string; secret: string } | null> {
  if (!process.stdin.isTTY) {
    return null;
  }
  // Prompt user to press Enter only if in an interactive terminal
  await promptUser('Press <Enter> to authenticate in the browser');

  // Set up promise to wait for callback
  let resolveCallback: (value: { key: string; secret: string }) => void;
  let rejectCallback: (error: Error) => void;
  const callbackPromise = new Promise<{ key: string; secret: string }>(
    (resolve, reject) => {
      resolveCallback = resolve;
      rejectCallback = reject;
    },
  );

  // Start local server on auto port
  const serverInfo = await startServer((req, res) => {
    // Get port from the request socket
    const url = new URL(req.url ?? '', `http://localhost:${serverInfo.port}`);

    if (url.pathname === '/callback') {
      const token = {
        key: url.searchParams.get('key'),
        secret: url.searchParams.get('secret'),
      };
      const ping = url.searchParams.get('ping');

      if (ping) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(createHTML(endpoint, 'auth'));
        return;
      }
      if (validateKeyAndSecret(token)) {
        // Send success response
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(createHTML(endpoint, 'done'));

        // Resolve the promise with token and secret
        return resolveCallback(token);
      }
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('Bad request');
      return rejectCallback(new Error('Missing key or secret in callback'));
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  const callbackUrl = `http://localhost:${serverInfo.port}/callback`;
  const authUrl = `${endpoint}/cli/auth?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  try {
    // Open browser
    await openBrowser(authUrl);
    const result = await callbackPromise;
    return result;
  } catch (error) {
    logger.error(
      `Failed to authenticate: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  } finally {
    // Clean up server
    await serverInfo.close();
  }
}
