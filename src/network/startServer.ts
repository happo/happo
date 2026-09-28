import http from 'node:http';

export interface ServerInfo {
  close: () => Promise<void>;
  port: number;
}

export default function startServer(
  requestHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  { port }: { port?: number | undefined } = {},
): Promise<ServerInfo> {
  return new Promise((resolve) => {
    const server = http.createServer(requestHandler);
    server.listen(port, () => {
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
