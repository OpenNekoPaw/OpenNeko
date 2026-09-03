import { describe, expect, it, vi } from 'vitest';

import { COMFYUI_PROFESSIONAL_APPLICATION_PROFILE } from '@neko/professional-apps-node/profiles/comfyui';
import {
  DesktopProfessionalApplicationAdapter,
  type DesktopProfessionalApplicationNativePort,
} from './desktop-professional-application-adapters';

describe('DesktopProfessionalApplicationAdapter', () => {
  it('advertises only the launcher operation for a detected application', async () => {
    const native = createNative(true);
    const adapter = new DesktopProfessionalApplicationAdapter(native, 'darwin');

    const inspection = await adapter.inspect({
      profile: COMFYUI_PROFESSIONAL_APPLICATION_PROFILE,
      binding: {
        integrationId: 'comfyui',
        launchPreference: 'reuse-qualified',
      },
    });

    expect(inspection.state).toBe('ready');
    expect(inspection.availableOperationIds).toContain('comfyui.launch');
    expect(inspection.availableOperationIds).not.toContain('comfyui.inspect-visible');
    expect(inspection.availableOperationIds).not.toContain('comfyui.run-workflow');
    expect(native.openMacApplication).not.toHaveBeenCalled();
  });

  it('reports an unavailable launcher when the desktop application is absent', async () => {
    const adapter = new DesktopProfessionalApplicationAdapter(createNative(false), 'darwin');

    const inspection = await adapter.inspect({
      profile: COMFYUI_PROFESSIONAL_APPLICATION_PROFILE,
      binding: {
        integrationId: 'comfyui',
        launchPreference: 'reuse-qualified',
      },
    });

    expect(inspection.state).toBe('not-installed');
    expect(inspection.availableOperationIds).not.toContain('comfyui.run-workflow');
    expect(inspection.availableOperationIds).not.toContain('comfyui.launch');
    expect(inspection.availableOperationIds).not.toContain('comfyui.send-input');
  });

  it('honors the user-owned launch preference without changing profile policy', async () => {
    const native = createNative(true);
    const adapter = new DesktopProfessionalApplicationAdapter(native, 'darwin');
    const operation = COMFYUI_PROFESSIONAL_APPLICATION_PROFILE.operations.find(
      (candidate) => candidate.id === 'comfyui.launch',
    );
    if (!operation) throw new Error('ComfyUI launch operation is missing.');

    await adapter.launch({
      profile: COMFYUI_PROFESSIONAL_APPLICATION_PROFILE,
      binding: {
        integrationId: 'comfyui',
        launchPreference: 'launch-new',
      },
      operation,
    });

    expect(native.openMacApplication).toHaveBeenCalledWith(
      'com.todesktop.241012ess7yxs0e',
      true,
      undefined,
    );
  });

  it('projects only the selected macOS bundle identity from a native path inspection', async () => {
    const native = createNative(true);
    const adapter = new DesktopProfessionalApplicationAdapter(native, 'darwin');

    await expect(adapter.identifySelectedApplication('/Applications/ComfyUI.app')).resolves.toBe(
      'com.todesktop.241012ess7yxs0e',
    );
    expect(native.readMacApplicationBundleId).toHaveBeenCalledWith(
      '/Applications/ComfyUI.app',
      undefined,
    );
  });
});

function createNative(appFound: boolean): DesktopProfessionalApplicationNativePort {
  return {
    findMacApplication: vi.fn(async () => appFound),
    readMacApplicationBundleId: vi.fn(async () => 'com.todesktop.241012ess7yxs0e'),
    openMacApplication: vi.fn(async () => undefined),
  };
}
