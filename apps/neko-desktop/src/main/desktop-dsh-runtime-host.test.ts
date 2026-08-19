import { describe, expect, it, vi } from 'vitest';

import { DesktopDshRuntimeHost } from './desktop-dsh-runtime-host';

const sender = { webContentsId: 1, frameUrl: 'openneko://app' };
const request = {
  requestId: 'request-1',
  operation: 'restart' as const,
  windowId: 'window-1',
  rendererSessionId: 'renderer-1',
};

describe('Desktop DSH runtime Host', () => {
  it('restarts only the canonical runtime and returns its resulting status', async () => {
    const restart = vi.fn(async () => undefined);
    const host = new DesktopDshRuntimeHost({
      runtime: { restart, getStatus: () => ({ status: 'running' }) },
      windows: {
        resolveSender: () => ({ windowId: 'window-1', rendererSessionId: 'renderer-1' }),
      },
    });

    await expect(host.execute(sender, request)).resolves.toEqual({
      requestId: 'request-1',
      projection: { status: 'running' },
    });
    expect(restart).toHaveBeenCalledOnce();
  });

  it('returns the fail-visible projection when restart fails', async () => {
    const projection = {
      status: 'unavailable' as const,
      diagnostic: {
        code: 'desktop-dsh-runtime-restart-failed' as const,
        message: 'ACP handshake rejected.',
      },
    };
    const host = new DesktopDshRuntimeHost({
      runtime: {
        restart: async () => Promise.reject(new Error('ACP handshake rejected.')),
        getStatus: () => projection,
      },
      windows: {
        resolveSender: () => ({ windowId: 'window-1', rendererSessionId: 'renderer-1' }),
      },
    });

    await expect(host.execute(sender, request)).resolves.toEqual({
      requestId: 'request-1',
      projection,
    });
  });

  it('rejects stale sender identity before restarting', async () => {
    const restart = vi.fn();
    const host = new DesktopDshRuntimeHost({
      runtime: { restart, getStatus: () => ({ status: 'running' }) },
      windows: {
        resolveSender: () => ({ windowId: 'window-1', rendererSessionId: 'renderer-current' }),
      },
    });

    await expect(host.execute(sender, request)).rejects.toThrow(/sender-bound/u);
    expect(restart).not.toHaveBeenCalled();
  });
});
