import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/**
 * Creates an HTTP request handler that serves static files from a given
 * directory.
 *
 * The returned handler resolves the request URL against the provided publicDir,
 * prevents path traversal outside that directory, and attempts to serve files
 * directly. If the resolved path is a directory, it serves its `index.html`
 * file. If the path has no extension and does not exist, it falls back to
 * `<path>.html`. Requests for missing resources respond with `404`.
 *
 * @example
 * import http from 'node:http';
 *
 * import staticFileHandler from './staticFileHandler.ts';
 *
 * const server = http.createServer(
 *   staticFileHandler(path.join(__dirname, 'public')),
 * );
 *
 * server.listen(3000);
 *
 * @returns An HTTP request handler suitable for use with `http.createServer`.
 */
export default function staticFileHandler(
  /** Absolute or relative path to the directory containing static assets. */
  publicDir: string,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  const publicRoot = path.resolve(publicDir);
  // Resolve symlinks in publicDir once so every request can compare against
  // the real root without repeated syscalls.
  const realPublicRootPromise = fs.realpath(publicRoot);

  return async (req, res) => {
    let urlPath: string;
    try {
      urlPath = decodeURI(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }

    const resolved = path.resolve(publicDir, `.${urlPath}`);

    // Prevent path traversal (string-based, defense-in-depth for non-symlink
    // cases and callers that bypass HTTP).
    if (resolved !== publicRoot && !resolved.startsWith(publicRoot + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }

    // Prevent symlink escapes: resolve all symlinks in the requested path and
    // re-validate against the real public root.
    const realPublicRoot = await realPublicRootPromise;
    try {
      const realResolved = await fs.realpath(resolved);
      if (
        realResolved !== realPublicRoot &&
        !realResolved.startsWith(realPublicRoot + path.sep)
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Broken symlink or unreadable path — deny access.
        res.writeHead(403);
        res.end();
        return;
      }
      // ENOENT: nothing to follow; existing read logic will return 404.
    }

    let filePath = resolved;
    let data: Buffer;
    try {
      data = await fs.readFile(filePath);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EISDIR') {
        filePath = path.join(resolved, 'index.html');
      } else if (code === 'ENOENT' && !path.extname(resolved)) {
        filePath = `${resolved}.html`;
      } else {
        res.writeHead(404);
        res.end();
        return;
      }
      try {
        data = await fs.readFile(filePath);
      } catch {
        res.writeHead(404);
        res.end();
        return;
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  };
}
