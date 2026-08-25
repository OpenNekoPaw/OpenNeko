import { describe, expect, it, vi } from 'vitest';
import type { ProfessionalApplicationService } from '@neko/professional-apps-node';

import { DesktopProfessionalApplicationHost } from './desktop-professional-application-host';

describe('DesktopProfessionalApplicationHost', () => {
  it('keeps a cancelled native selection local and does not update the binding', async () => {
    const service = createService();
    const host = new DesktopProfessionalApplicationHost({
      service,
      windows: {
        resolveSender: vi.fn(() => ({
          windowId: 'window-1',
          rendererSessionId: 'renderer-session-1',
        })),
      },
      selection: { selectApplicationIdentity: vi.fn(async () => undefined) },
    });

    await expect(
      host.execute(
        { webContentsId: 7, frameUrl: 'file:///renderer/index.html' },
        {
          requestId: 'request-1',
          identity: { windowId: 'window-1' },
          route: 'application.select',
          integrationId: 'comfyui',
        },
      ),
    ).resolves.toMatchObject({
      selectionReceipt: { integrationId: 'comfyui', status: 'cancelled' },
    });
    expect(service.bindApplicationIdentity).not.toHaveBeenCalled();
  });

  it('passes only the inspected identity into the owning service', async () => {
    const service = createService();
    const host = new DesktopProfessionalApplicationHost({
      service,
      windows: {
        resolveSender: vi.fn(() => ({
          windowId: 'window-1',
          rendererSessionId: 'renderer-session-1',
        })),
      },
      selection: {
        selectApplicationIdentity: vi.fn(async () => 'com.todesktop.241012ess7yxs0e'),
      },
    });

    await host.execute(
      { webContentsId: 7, frameUrl: 'file:///renderer/index.html' },
      {
        requestId: 'request-2',
        identity: { windowId: 'window-1' },
        route: 'application.select',
        integrationId: 'comfyui',
      },
    );

    expect(service.bindApplicationIdentity).toHaveBeenCalledWith(
      'window-1',
      'comfyui',
      'com.todesktop.241012ess7yxs0e',
    );
  });

  it('rejects a selection request for a different sender-bound Window', async () => {
    const service = createService();
    const selectApplicationIdentity = vi.fn();
    const host = new DesktopProfessionalApplicationHost({
      service,
      windows: {
        resolveSender: vi.fn(() => ({
          windowId: 'window-1',
          rendererSessionId: 'renderer-session-1',
        })),
      },
      selection: { selectApplicationIdentity },
    });

    await expect(
      host.execute(
        { webContentsId: 7, frameUrl: 'file:///renderer/index.html' },
        {
          requestId: 'request-3',
          identity: { windowId: 'window-2' },
          route: 'application.select',
          integrationId: 'comfyui',
        },
      ),
    ).rejects.toThrow(/sender-bound Window/u);
    expect(selectApplicationIdentity).not.toHaveBeenCalled();
  });
});

function createService(): ProfessionalApplicationService {
  const projection = { identity: { windowId: 'window-1' }, items: [] } as const;
  return {
    getProjection: vi.fn(async () => projection),
    addBinding: vi.fn(async () => projection),
    updateBinding: vi.fn(async () => projection),
    setEnabled: vi.fn(async () => projection),
    removeBinding: vi.fn(async () => projection),
    bindApplicationIdentity: vi.fn(async () => projection),
    launch: vi.fn(async () => ({
      integrationId: 'comfyui',
      operationId: 'comfyui.launch',
      status: 'launched' as const,
      targetIdentity: 'com.todesktop.241012ess7yxs0e',
    })),
    listResourceActions: vi.fn(async () => []),
    handoff: vi.fn(async () => ({
      handoffId: 'handoff-1',
      integrationId: 'comfyui',
      operationId: 'comfyui.send-input',
      status: 'transferred' as const,
      targetIdentity: 'com.todesktop.241012ess7yxs0e',
    })),
  };
}
