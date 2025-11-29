import type { Logger } from '../isomorphic/types.ts';
import startServer from '../network/startServer.ts';
import openBrowser from './openBrowser.ts';
import promptUser from './promptUser.ts';

function createHTML({ title, body }: { title: string; body: string }): string {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <title>${title}</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <script type="text/javascript">
        window.history.replaceState({}, '', '/callback');
      </script>
      <style>
        body {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: sans-serif;
          background-color: #ffffff;
          color: #333333;
        }
        main {
          font-family: sans-serif;
          max-width: 600px;
          margin: 0 auto;
          padding: 50px 20px;
          text-align: center;
        }
        
        @media (prefers-color-scheme: dark) {
          body {
            background-color: #121212;
            color: #ffffff;
          }
        }
        
      </style>
    </head>
    <body>
      <main>
        <h1>${title}</h1> 
        <p>${body}</p>
      </main>
    </body>
  </html>`;
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
      const key = url.searchParams.get('key');
      const secret = url.searchParams.get('secret');

      if (key && secret) {
        // Send success response
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          createHTML({
            title: 'Authentication successful!',
            body: 'You can close this window.',
          }),
        );

        // Resolve the promise with token and secret
        return resolveCallback({ key, secret });
      }
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(
        createHTML({
          title: 'Authentication failed',
          body: 'Missing key or secret.',
        }),
      );
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
