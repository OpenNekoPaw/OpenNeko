import { describe, expect, it, vi } from 'vitest';

import { COMFYUI_PROFESSIONAL_APPLICATION_PROFILE } from '@neko/professional-apps-node/profiles/comfyui';
import {
  DesktopProfessionalApplicationAdapter,
  type DesktopProfessionalApplicationNativePort,
} from './desktop-professional-application-adapters';

describe('DesktopProfessionalApplicationAdapter', () => {
  it('keeps unavailable API and Computer Use operations out of launch readiness', async () => {
    const native = createNative({ appFound: true, apiStatus: 503 });
    const adapter = new DesktopProfessionalApplicationAdapter(native, 'darwin');

    const inspection = await adapter.inspect({
      profile: COMFYUI_PROFESSIONAL_APPLICATION_PROFILE,
      binding: {
        integrationId: 'comfyui',
        endpoint: 'http://127.0.0.1:8188',
        launchPreference: 'reuse-qualified',
      },
    });

    expect(inspection.state).toBe('ready');
    expect(inspection.availableOperationIds).toContain('comfyui.launch');
    expect(inspection.availableOperationIds).not.toContain('comfyui.inspect-visible');
    expect(inspection.availableOperationIds).not.toContain('comfyui.run-workflow');
    expect(native.openMacApplication).not.toHaveBeenCalled();
  });

  it('detects an exact loopback service without advertising an uncomposed API operation', async () => {
    const adapter = new DesktopProfessionalApplicationAdapter(
      createNative({ appFound: false, apiStatus: 200 }),
      'darwin',
    );

    const inspection = await adapter.inspect({
      profile: COMFYUI_PROFESSIONAL_APPLICATION_PROFILE,
      binding: {
        integrationId: 'comfyui',
        endpoint: 'http://127.0.0.1:8188',
        launchPreference: 'reuse-qualified',
      },
    });

    expect(inspection.state).toBe('detected');
    expect(inspection.availableOperationIds).not.toContain('comfyui.run-workflow');
    expect(inspection.availableOperationIds).not.toContain('comfyui.launch');
    expect(inspection.availableOperationIds).not.toContain('comfyui.send-input');
  });

  it('advertises only composed API operations after exact loopback readiness succeeds', async () => {
    const adapter = new DesktopProfessionalApplicationAdapter(
      createNative({ appFound: false, apiStatus: 200 }),
      'darwin',
      { comfyUiApiExecution: true },
    );

    const inspection = await adapter.inspect({
      profile: COMFYUI_PROFESSIONAL_APPLICATION_PROFILE,
      binding: {
        integrationId: 'comfyui',
        endpoint: 'http://127.0.0.1:8188',
        launchPreference: 'reuse-qualified',
      },
    });

    expect(inspection.state).toBe('ready');
    expect(inspection.availableOperationIds).toEqual([
      'comfyui.run-workflow',
      'comfyui.observe-workflow',
      'comfyui.cancel-workflow',
      'comfyui.retrieve-output',
    ]);
    expect(inspection.availableOperationIds).not.toContain('comfyui.inspect-visible');
    expect(inspection.availableOperationIds).not.toContain('comfyui.send-input');
  });

  it('honors the user-owned launch preference without changing profile policy', async () => {
    const native = createNative({ appFound: true, apiStatus: 200 });
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
    const native = createNative({ appFound: true, apiStatus: 200 });
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

function createNative(input: {
  readonly appFound: boolean;
  readonly apiStatus: number;
}): DesktopProfessionalApplicationNativePort {
  return {
    findMacApplication: vi.fn(async () => input.appFound),
    readMacApplicationBundleId: vi.fn(async () => 'com.todesktop.241012ess7yxs0e'),
    openMacApplication: vi.fn(async () => undefined),
    request: vi.fn(
      async () =>
        new Response(JSON.stringify({ system: {} }), {
          status: input.apiStatus,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  };
}
