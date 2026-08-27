import { createServer, type Server } from 'node:http';

export interface HttpServerHandle {
  server: Server;
  close: () => Promise<void>;
}

export interface StartHttpServerOptions {
  port?: number;
  host?: string;
}

export function defaultPort(): number {
  const parsed = Number(process.env.PORT ?? 3000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
}

export function startHttpServer(options: StartHttpServerOptions = {}): Promise<HttpServerHandle> {
  const port = options.port ?? defaultPort();
  const host = options.host ?? '0.0.0.0';

  const server = createServer((req, res) => {
    res.setHeader('Connection', 'close');
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/health/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  return new Promise<HttpServerHandle>((resolveHandle, rejectHandle) => {
    server.once('error', rejectHandle);
    server.listen(port, host, () => {
      server.removeListener('error', rejectHandle);
      resolveHandle({
        server,
        close: () =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections?.();
          }),
      });
    });
  });
}
