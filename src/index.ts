import type { Application, Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

const SIGNALS = ['SIGTERM', 'SIGINT'] as const;
const DEFAULT_TIMEOUT = 1000 * 10;

export type SigEvent = typeof SIGNALS[number];

export type GracefulOptions = {
  host?: string,
  port?: number,
  timeout?: number,
  logger?: (...args: unknown[]) => void,
  onReady?: () => void,
  onShutdown?: (event: SigEvent) => void,
};

export type GracefulInstance = {
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  start: (app: Application) => void,
};

export const createGraceful = (options?: GracefulOptions): GracefulInstance => {
  const {
    host,
    port = 3000,
    timeout = DEFAULT_TIMEOUT,
    logger,
    onReady,
    onShutdown,
  } = options ?? {};
  let isShuttingDown = false;
  let httpListener: Server;

  const middleware = (_req: Request, res: Response, next: NextFunction) => {
    if (!isShuttingDown) return next();
    res.setHeader('Connection', 'close');
    res.status(502).send('Server is shutting down.');
  };

  const getShutdownHandler = (event: SigEvent) => () => {
    if (isShuttingDown) return false;

    logger?.(`Received ${event}, shutting down...`);

    isShuttingDown = true;
    httpListener.close(() => {
      logger?.('Closed remaining connections.');
      process.exit(0);
    });
    httpListener.closeIdleConnections();

    setTimeout(() => {
      logger?.("Couldn't close connections in time, forcefully shutting down.");
      process.exit(1);
    }, timeout);

    onShutdown?.(event);
  };

  const start = (app: Application) => {
    const message = `Server listening on http://${host ?? 'localhost'}:${port}`;

    const sendEvents = (text: string) => {
      logger?.(text);
      onReady?.();
    };

    if (host) {
      httpListener = app.listen(port, host, () => sendEvents(`${message} (bound to host: ${host})`));
    } else {
      httpListener = app.listen(port, () => sendEvents(message));
    }

    SIGNALS.forEach((event) => process.on(event, getShutdownHandler(event)));
  };

  return { middleware, start };
};
