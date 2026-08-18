import { describe, expect, it, vi } from 'vitest';

import { DesktopDshPermissionHost } from './desktop-dsh-permission-host';

const sender = { webContentsId: 9, frameUrl: 'openneko://desktop/index.html' };
const identity = {
  conversationId: 'conversation-1',
  dshSessionId: 'session-1',
  turn: 2,
  toolCallId: 'tool-1',
};

describe('DesktopDshPermissionHost', () => {
  it('lists only after exact sender and renderer session validation', async () => {
    const resolveSender = vi.fn(() => ({
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
    }));
    const list = vi.fn(() => []);
    const host = new DesktopDshPermissionHost({
      permissions: { list, decide: vi.fn(), cancel: vi.fn() },
      windows: { resolveSender },
      publishChanged: vi.fn(),
    });

    await expect(
      host.execute(sender, {
        requestId: 'request-1',
        operation: 'list',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        conversationId: identity.conversationId,
      }),
    ).resolves.toEqual({
      requestId: 'request-1',
      conversationId: identity.conversationId,
      pending: [],
    });
    expect(resolveSender).toHaveBeenCalledWith(sender);
    expect(list).toHaveBeenCalledWith(identity.conversationId);
  });

  it('passes the complete exact identity and advertised option to the owner', async () => {
    const decide = vi.fn(async () => undefined);
    const host = new DesktopDshPermissionHost({
      permissions: { list: () => [], decide, cancel: vi.fn() },
      windows: {
        resolveSender: () => ({ windowId: 'window-1', rendererSessionId: 'renderer-1' }),
      },
      publishChanged: vi.fn(),
    });

    await host.execute(sender, {
      requestId: 'request-2',
      operation: 'decide',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      ...identity,
      optionId: 'allow-once',
    });

    expect(decide).toHaveBeenCalledWith({
      requestId: 'request-2',
      operation: 'decide',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      ...identity,
      optionId: 'allow-once',
    });
  });

  it('does not touch the permission owner when sender validation fails', async () => {
    const decide = vi.fn();
    const host = new DesktopDshPermissionHost({
      permissions: { list: vi.fn(), decide, cancel: vi.fn() },
      windows: {
        resolveSender: () => ({ windowId: 'window-1', rendererSessionId: 'renderer-1' }),
      },
      publishChanged: vi.fn(),
    });

    await expect(
      host.execute(sender, {
        requestId: 'request-3',
        operation: 'decide',
        windowId: 'window-1',
        rendererSessionId: 'renderer-stale',
        ...identity,
        optionId: 'allow-once',
      }),
    ).rejects.toThrow('renderer session');
    expect(decide).not.toHaveBeenCalled();
  });

  it('publishes only the changed Conversation identity', () => {
    const publishChanged = vi.fn();
    const host = new DesktopDshPermissionHost({
      permissions: { list: vi.fn(), decide: vi.fn(), cancel: vi.fn() },
      windows: {
        resolveSender: () => ({ windowId: 'window-1', rendererSessionId: 'renderer-1' }),
      },
      publishChanged,
    });

    host.publishChanged(identity.conversationId);
    expect(publishChanged).toHaveBeenCalledWith({ conversationId: identity.conversationId });
  });
});
