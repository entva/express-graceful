import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGraceful } from './index.js';

const SIGNAL = 'SIGTERM';
const PORT = 3000;

const createServer = () => ({
  listen: vi.fn().mockReturnThis(),
  close: vi.fn().mockReturnThis(),
});

const createRes = () => ({
  setHeader: vi.fn().mockReturnThis(),
  status: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
});

describe('createGraceful', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('middleware passes through when not shutting down', () => {
    const { middleware } = createGraceful();
    const res = createRes();
    const next = vi.fn();

    middleware({} as never, res as never, next);

    expect(res.send).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('middleware returns 502 during shutdown', () => new Promise<void>((resolve) => {
    const server = createServer();
    const { middleware, start } = createGraceful();
    const res = createRes();
    const next = vi.fn();

    start(server as never, { port: PORT });
    process.kill(process.pid, SIGNAL);

    process.once(SIGNAL, () => {
      process.nextTick(() => {
        middleware({} as never, res as never, next);
        expect(res.setHeader).toHaveBeenCalledWith('Connection', 'close');
        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.send).toHaveBeenCalledOnce();
        expect(next).not.toHaveBeenCalled();
        resolve();
      });
    });
  }));

  it('starts listening on port', () => {
    const server = createServer();
    const { start } = createGraceful();

    start(server as never, { port: PORT });

    expect(server.listen).toHaveBeenCalledWith(PORT, expect.any(Function));
  });

  it('starts listening with host', () => {
    const server = createServer();
    const { start } = createGraceful();
    const host = 'example.com';

    start(server as never, { port: PORT, host });

    expect(server.listen).toHaveBeenCalledWith(PORT, host, expect.any(Function));
  });

  it('calls shutdown handler on signal', () => new Promise<void>((resolve) => {
    const server = createServer();
    const { start } = createGraceful();
    const handler = vi.fn();

    start(server as never, { port: PORT }, handler);
    process.kill(process.pid, SIGNAL);

    process.once(SIGNAL, () => {
      process.nextTick(() => {
        expect(handler).toHaveBeenCalledWith(SIGNAL);
        resolve();
      });
    });
  }));

  it('calls server.close() on signal', () => new Promise<void>((resolve) => {
    const server = createServer();
    const { start } = createGraceful();

    start(server as never, { port: PORT });
    process.kill(process.pid, SIGNAL);

    process.once(SIGNAL, () => {
      process.nextTick(() => {
        expect(server.close).toHaveBeenCalledOnce();
        resolve();
      });
    });
  }));

  it('calls process.exit(1) after timeout', () => new Promise<void>((resolve) => {
    vi.useFakeTimers();
    const server = createServer();
    const { start } = createGraceful();
    const TIMEOUT = 1000;

    start(server as never, { port: PORT, timeout: TIMEOUT });
    process.kill(process.pid, SIGNAL);

    process.once(SIGNAL, () => {
      process.nextTick(() => {
        expect(exitSpy).not.toHaveBeenCalled();
        vi.advanceTimersByTime(TIMEOUT + 10);
        expect(exitSpy).toHaveBeenCalledWith(1);
        vi.useRealTimers();
        resolve();
      });
    });
  }));

  it('instances are isolated', () => {
    const serverA = createServer();
    const serverB = createServer();
    const { start: startA } = createGraceful();
    const { start: startB } = createGraceful();

    startA(serverA as never, { port: 3001 });
    startB(serverB as never, { port: 3002 });

    expect(serverA.listen).toHaveBeenCalledWith(3001, expect.any(Function));
    expect(serverB.listen).toHaveBeenCalledWith(3002, expect.any(Function));
  });
});
