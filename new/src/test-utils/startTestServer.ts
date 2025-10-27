import http from 'node:http';

import handler from 'serve-handler';

import startServer, { type ServerInfo } from '../network/startServer.ts';

export default function startTestServer(publicDir: string): Promise<ServerInfo> {
  return startServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    return handler(req, res, { public: publicDir });
  });
}
