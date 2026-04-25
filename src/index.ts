import type { Application, Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

const SIGNALS = ['SIGTERM', 'SIGINT'] as const;

const isDebug = process.env.DEBUG?.includes('express-graceful');

type Options = {
  host?: string,
  port?: number,
  timeout?: number,
  logger?: (message: string) => void,
};

type Handler = (event: string) => void;

type GracefulInstance = {
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  start: (app: Application, options?: Options, handler?: Handler) => void,
};

export const createGraceful = (): GracefulInstance => {
  let isShuttingDown = false;
  let httpListener: Server;

  const middleware = (_req: Request, res: Response, next: NextFunction) => {
    if (!isShuttingDown) return next();
    res.setHeader('Connection', 'close');
    res.status(502).send('Server is shutting down.');
  };

  const getShutdownHandler = (event: string, timeout: number, onClose?: Handler) => () => {
    if (isShuttingDown) return false;

    if (isDebug) console.info(`Received ${event}, shutting down.`);

    isShuttingDown = true;
    httpListener.close(() => {
      if (isDebug) console.info('Closed remaining connections.');
      process.exit(0);
    });

    if (typeof onClose === 'function') onClose(event);

    setTimeout(() => {
      if (isDebug) console.info("Couldn't close connections in time, forcefully shutting down.");
      process.exit(1);
    }, timeout);

    return true;
  };

  const start = (app: Application, options?: Options, handler?: Handler) => {
    const { host, port = 3000, timeout = 1000, logger } = options ?? {};

    const message = `Server listening on http://${host ?? 'localhost'}:${port}`;

    const sendEvents = (text: string) => {
      logger?.(text);
      if (process.connected) process.send?.('ready');
    };

    if (host) {
      httpListener = app.listen(port, host, () => sendEvents(`${message} (bound to host: ${host})`));
    } else {
      httpListener = app.listen(port, () => sendEvents(message));
    }

    SIGNALS.forEach((event) => process.on(event, getShutdownHandler(event, timeout, handler)));
  };

  return { middleware, start };
};
