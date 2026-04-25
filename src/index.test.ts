import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGraceful } from './index.js';

const SIGNAL = 'SIGTERM';
const PORT = 3000;

const createServer = () => ({
  listen: vi.fn().mockReturnThis(),
  close: vi.fn().mockReturnThis(),
  closeIdleConnections: vi.fn(),
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
    const { middleware, start } = createGraceful({ port: PORT });
    const res = createRes();
    const next = vi.fn();

    start(server as never);
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
    const { start } = createGraceful({ port: PORT });

    start(server as never);

    expect(server.listen).toHaveBeenCalledWith(PORT, expect.any(Function));
  });

  it('starts listening with host', () => {
    const server = createServer();
    const host = 'example.com';
    const { start } = createGraceful({ port: PORT, host });

    start(server as never);

    expect(server.listen).toHaveBeenCalledWith(PORT, host, expect.any(Function));
  });

  it('calls onShutdown handler on signal', () => new Promise<void>((resolve) => {
    const server = createServer();
    const onShutdown = vi.fn();
    const { start } = createGraceful({ port: PORT, onShutdown });

    start(server as never);
    process.kill(process.pid, SIGNAL);

    process.once(SIGNAL, () => {
      process.nextTick(() => {
        expect(onShutdown).toHaveBeenCalledWith(SIGNAL);
        resolve();
      });
    });
  }));

  it('calls server.close() on signal', () => new Promise<void>((resolve) => {
    const server = createServer();
    const { start } = createGraceful({ port: PORT });

    start(server as never);
    process.kill(process.pid, SIGNAL);

    process.once(SIGNAL, () => {
      process.nextTick(() => {
        expect(server.close).toHaveBeenCalledOnce();
        resolve();
      });
    });
  }));

  it('calls closeIdleConnections() on signal', () => new Promise<void>((resolve) => {
    const server = createServer();
    const { start } = createGraceful({ port: PORT });

    start(server as never);
    process.kill(process.pid, SIGNAL);

    process.once(SIGNAL, () => {
      process.nextTick(() => {
        expect(server.closeIdleConnections).toHaveBeenCalledOnce();
        resolve();
      });
    });
  }));

  it('calls process.exit(1) after timeout', () => new Promise<void>((resolve) => {
    vi.useFakeTimers();
    const server = createServer();
    const TIMEOUT = 1000;
    const { start } = createGraceful({ port: PORT, timeout: TIMEOUT });

    start(server as never);
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

  it('calls onReady after server binds', () => {
    const server = createServer();
    const onReady = vi.fn();
    const { start } = createGraceful({ port: PORT, onReady });

    start(server as never);
    const listenCallback = server.listen.mock.calls[0].at(-1) as () => void;
    listenCallback();

    expect(onReady).toHaveBeenCalledOnce();
  });

  it('instances are isolated', () => {
    const serverA = createServer();
    const serverB = createServer();
    const { start: startA } = createGraceful({ port: 3001 });
    const { start: startB } = createGraceful({ port: 3002 });

    startA(serverA as never);
    startB(serverB as never);

    expect(serverA.listen).toHaveBeenCalledWith(3001, expect.any(Function));
    expect(serverB.listen).toHaveBeenCalledWith(3002, expect.any(Function));
  });
});
