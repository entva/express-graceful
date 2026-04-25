import type { Application, Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

const SIGNALS = ['SIGTERM', 'SIGINT'] as const;

type Options = {
  host?: string,
  port?: number,
  timeout?: number,
  logger?: (message: string) => void,
  onReady?: (event: string) => void,
  onShutdown?: (event: string) => void,
};

type GracefulInstance = {
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  start: (app: Application) => void,
};

export const createGraceful = (options?: Options): GracefulInstance => {
  const { host, port = 3000, timeout = 1000, logger, onReady, onShutdown } = options ?? {};
  let isShuttingDown = false;
  let httpListener: Server;

  const middleware = (_req: Request, res: Response, next: NextFunction) => {
    if (!isShuttingDown) return next();
    res.setHeader('Connection', 'close');
    res.status(502).send('Server is shutting down.');
  };

  const getShutdownHandler = (event: string) => () => {
    if (isShuttingDown) return false;

    logger?.(`Received ${event}, shutting down...`);

    isShuttingDown = true;
    httpListener.close(() => {
      logger?.('Closed remaining connections.');
      process.exit(0);
    });

    onShutdown?.(event);

    setTimeout(() => {
      logger?.("Couldn't close connections in time, forcefully shutting down.");
      process.exit(1);
    }, timeout);

    return true;
  };

  const start = (app: Application) => {
    const message = `Server listening on http://${host ?? 'localhost'}:${port}`;

    const sendEvents = (text: string) => {
      logger?.(text);
      if (process.connected) process.send?.('ready');
      onReady?.('ready');
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
