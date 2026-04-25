import type { Application, Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

const events = [
  'SIGTERM',
  'SIGINT',
];

const isDebug = process.env.DEBUG?.includes('express-graceful');
let isShuttingDown = false;
let processTimeout = 1000;
let httpListener: Server;
let onClose: ((event: string) => void) | undefined;

const handleClose = () => {
  if (isDebug) console.info('Closed remaining connections.');
  process.exit(0);
};

const handleTimeout = () => {
  if (isDebug) console.info('Couldn\'t close connections in time, forcefully shutting down.');
  process.exit(1);
};

const getShutdownHandler = (event: string) => () => {
  if (isShuttingDown) return false;

  if (isDebug) console.info(`Received ${event}, shutting down.`);

  isShuttingDown = true;
  httpListener.close(handleClose);
  if (typeof onClose === 'function') onClose(event);

  setTimeout(handleTimeout, processTimeout);
  return true;
};

export const middleware = (req: Request, res: Response, next: NextFunction) => {
  if (!isShuttingDown) return next();
  res.setHeader('Connection', 'close');
  res.status(502).send('Server is shutting down.');
};

export const shutdownMiddleware = () => middleware;

const defaultOptions = {
  port: 3000,
  timeout: 1000,
};
type Options = {
  host?: string,
  port?: number,
  timeout?: number,
  logger?: (message: string) => void,
};
type Handler = (event: string) => void;
export const start = (app: Application, options?: Options, handler?: Handler) => {
  const { host, port, timeout, logger } = { ...defaultOptions, ...options };

  const message = `Server listening on http://${host || 'localhost'}:${port}`;

  if (typeof timeout === 'number') processTimeout = timeout;
  onClose = handler;

  const sendEvents = (text: string) => {
    logger?.(text);
    if (process.connected) process.send?.('ready');
  };

  if (host) {
    httpListener = app.listen(port, host, () => sendEvents(`${message} (bound to host: ${host})`));
  } else {
    httpListener = app.listen(port, () => sendEvents(message));
  }

  events.forEach((event) => process.on(event, getShutdownHandler(event)));
};
