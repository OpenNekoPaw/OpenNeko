import { describe, expect, it, vi } from 'vitest';
import type { ProfessionalApplicationHostRequest } from '@neko/professional-apps-contracts/host';

import { DesktopProfessionalApplicationRuntime } from './desktop-professional-application-runtime';

describe('DesktopProfessionalApplicationRuntime', () => {
  it('binds requests to its exact Window and exposes a launch receipt', async () => {
    const execute = vi.fn(async (request: ProfessionalApplicationHostRequest) => ({
      requestId: request.requestId,
      route: request.route,
      projection: { identity: { windowId: 'window-1' }, items: [] },
      ...(request.route === 'application.launch'
        ? {
            launchReceipt: {
              integrationId: request.integrationId,
              operationId: 'comfyui.launch',
              status: 'launched' as const,
              targetIdentity: 'com.todesktop.241012ess7yxs0e',
            },
          }
        : request.route === 'application.select'
          ? {
              selectionReceipt: {
                integrationId: request.integrationId,
                status: 'selected' as const,
              },
            }
          : {}),
    }));
    const runtime = new DesktopProfessionalApplicationRuntime(
      { windowId: 'window-1' },
      { professionalApplications: { execute } },
    );

    await expect(runtime.getSnapshot()).resolves.toEqual({
      identity: { windowId: 'window-1' },
      items: [],
    });
    await expect(runtime.launch('comfyui')).resolves.toMatchObject({
      status: 'launched',
      integrationId: 'comfyui',
    });
    await expect(runtime.selectApplication('comfyui')).resolves.toEqual({
      identity: { windowId: 'window-1' },
      items: [],
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'application.select', integrationId: 'comfyui' }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ identity: { windowId: 'window-1' } }),
    );
  });

  it('rejects work after disposal', async () => {
    const runtime = new DesktopProfessionalApplicationRuntime(
      { windowId: 'window-1' },
      { professionalApplications: { execute: vi.fn() } },
    );
    runtime.dispose();
    await expect(runtime.getSnapshot()).rejects.toThrow(/disposed/u);
  });
});
