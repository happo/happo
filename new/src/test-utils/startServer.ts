import http from 'node:http';

import handler from 'serve-handler';

export interface ServerInfo {
  close: () => Promise<void>;
  port: number;
}

export default function startServer(publicDir: string): Promise<ServerInfo> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      return handler(req, res, { public: publicDir });
    });
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected server address to be AddressInfo');
      }
      resolve({
        close: () =>
          new Promise((resolve, reject) =>
            server.close((err) => (err ? reject(err) : resolve())),
          ),
        port: address.port,
      });
    });
  });
}
