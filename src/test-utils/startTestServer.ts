import startServer, { type ServerInfo } from '../network/startServer.ts';
import staticFileHandler from './staticFileHandler.ts';

export default function startTestServer(
  publicDir: string,
  port?: number,
): Promise<ServerInfo> {
  return startServer(staticFileHandler(publicDir), { port });
}
