import { describe, expect, it, vi } from 'vitest';

import {
  createInMemoryProfessionalApplicationBindingRepository,
  createProfessionalApplicationService,
  type ProfessionalApplicationDiscoveryPort,
} from './index';
import { COMFYUI_PROFESSIONAL_APPLICATION_PROFILE } from './profiles/comfyui';

function readyInspection() {
  return {
    integrationId: 'comfyui',
    state: 'ready',
    detectedApplicationIdentity: 'com.todesktop.241012ess7yxs0e',
    detectedVendorRelease: '0.7.0',
    availableOperationIds: COMFYUI_PROFESSIONAL_APPLICATION_PROFILE.operations.map(
      (operation) => operation.id,
    ),
    diagnostics: [],
  } as const;
}

describe('ProfessionalApplicationService', () => {
  it('projects only registered profiles and isolates a failed probe', async () => {
    const failing = {
      ...COMFYUI_PROFESSIONAL_APPLICATION_PROFILE,
      id: 'comfyui-secondary',
      name: 'ComfyUI secondary',
      operations: COMFYUI_PROFESSIONAL_APPLICATION_PROFILE.operations.map((operation) => ({
        ...operation,
        id: operation.id.replace('comfyui.', 'comfyui-secondary.'),
      })),
    };
    const discovery: ProfessionalApplicationDiscoveryPort = {
      inspect: vi.fn(async ({ profile }) => {
        if (profile.id === failing.id) throw new Error('probe unavailable');
        return readyInspection();
      }),
    };
    const service = createService(discovery, [COMFYUI_PROFESSIONAL_APPLICATION_PROFILE, failing]);

    const projection = await service.getProjection('window-1');

    expect(projection.items.find((item) => item.profile.id === 'comfyui')?.readiness.state).toBe(
      'ready',
    );
    expect(
      projection.items.find((item) => item.profile.id === 'comfyui-secondary')?.readiness,
    ).toMatchObject({
      state: 'unavailable',
      availableOperationIds: [],
      diagnostics: [{ code: 'profile-probe-failed' }],
    });
  });

  it('provides semantic image handoff and transfers only an authorized locator', async () => {
    const discovery: ProfessionalApplicationDiscoveryPort = {
      inspect: vi.fn(async () => readyInspection()),
    };
    const authorize = vi.fn(async () => ({ authorizationId: 'authorization-1' }));
    const transfer = vi.fn(async () => ({ targetIdentity: 'comfyui-window-1', accepted: true }));
    const service = createProfessionalApplicationService({
      profiles: [COMFYUI_PROFESSIONAL_APPLICATION_PROFILE],
      bindings: createInMemoryProfessionalApplicationBindingRepository(),
      discovery,
      launcher: {
        launch: vi.fn(async () => ({ targetIdentity: 'comfyui-window-1' })),
        transfer,
      },
      contentAuthorization: { authorize },
    });
    const source = {
      kind: 'candidate',
      ownerId: 'generation',
      resourceId: 'image-1',
      candidateId: 'candidate-1',
      mimeType: 'image/png',
    } as const;

    await expect(service.listResourceActions(source)).resolves.toEqual([
      {
        integrationId: 'comfyui',
        operationId: 'comfyui.send-input',
        label: 'Send to ComfyUI…',
        source,
      },
    ]);
    await expect(
      service.handoff({
        handoffId: 'handoff-1',
        integrationId: 'comfyui',
        operationId: 'comfyui.send-input',
        source,
        locator: { file: { authority: 'workspace', path: 'neko/generated/image-1.png' } },
      }),
    ).resolves.toEqual({
      handoffId: 'handoff-1',
      integrationId: 'comfyui',
      operationId: 'comfyui.send-input',
      status: 'transferred',
      targetIdentity: 'comfyui-window-1',
    });
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(transfer).toHaveBeenCalledWith(
      expect.objectContaining({ authorizationId: 'authorization-1' }),
    );
    expect(JSON.stringify(transfer.mock.calls)).not.toContain('neko/generated/image-1.png');
  });

  it('does not replace an unavailable API operation with Computer Use', async () => {
    const discovery: ProfessionalApplicationDiscoveryPort = {
      inspect: vi.fn(async () => ({
        ...readyInspection(),
        availableOperationIds: ['comfyui.inspect-visible'],
      })),
    };
    const launch = vi.fn();
    const service = createProfessionalApplicationService({
      profiles: [COMFYUI_PROFESSIONAL_APPLICATION_PROFILE],
      bindings: createInMemoryProfessionalApplicationBindingRepository(),
      discovery,
      launcher: { launch, transfer: vi.fn() },
      contentAuthorization: { authorize: vi.fn() },
    });

    await expect(service.launch('comfyui')).rejects.toMatchObject({
      code: 'professional-application-operation-unavailable',
    });
    expect(launch).not.toHaveBeenCalled();
  });

  it('rejects duplicate profile identity instead of overwriting registration', () => {
    expect(() =>
      createService({ inspect: vi.fn(async () => readyInspection()) }, [
        COMFYUI_PROFESSIONAL_APPLICATION_PROFILE,
        COMFYUI_PROFESSIONAL_APPLICATION_PROFILE,
      ]),
    ).toThrow(/unique/u);
  });

  it('binds only an exact application identity and preserves adjacent user configuration', async () => {
    const bindings = createInMemoryProfessionalApplicationBindingRepository([
      {
        integrationId: 'comfyui',
        endpoint: 'http://127.0.0.1:8188',
        launchPreference: 'launch-new',
        defaultWorkflowId: 'portrait-review',
      },
    ]);
    const service = createProfessionalApplicationService({
      profiles: [COMFYUI_PROFESSIONAL_APPLICATION_PROFILE],
      bindings,
      discovery: { inspect: vi.fn(async () => readyInspection()) },
      launcher: { launch: vi.fn(), transfer: vi.fn() },
      contentAuthorization: { authorize: vi.fn() },
    });

    const projection = await service.bindApplicationIdentity(
      'window-1',
      'comfyui',
      'com.todesktop.241012ess7yxs0e',
    );

    expect(projection.items[0]?.binding).toEqual({
      integrationId: 'comfyui',
      applicationLocator: {
        kind: 'application-identity',
        identity: 'com.todesktop.241012ess7yxs0e',
      },
      endpoint: 'http://127.0.0.1:8188',
      launchPreference: 'launch-new',
      defaultWorkflowId: 'portrait-review',
    });
    await expect(
      service.bindApplicationIdentity('window-1', 'comfyui', 'org.krita'),
    ).rejects.toMatchObject({ code: 'professional-application-identity-mismatch' });
    expect((await bindings.get('comfyui'))?.applicationLocator).toEqual({
      kind: 'application-identity',
      identity: 'com.todesktop.241012ess7yxs0e',
    });

    await service.updateBinding('window-1', {
      integrationId: 'comfyui',
      applicationLocator: {
        kind: 'application-identity',
        identity: 'com.todesktop.241012ess7yxs0e',
      },
      endpoint: 'http://127.0.0.1:8288',
      launchPreference: 'reuse-qualified',
      defaultWorkflowId: 'landscape-review',
    });
    expect(await bindings.get('comfyui')).toMatchObject({
      applicationLocator: {
        kind: 'application-identity',
        identity: 'com.todesktop.241012ess7yxs0e',
      },
      endpoint: 'http://127.0.0.1:8288',
      launchPreference: 'reuse-qualified',
      defaultWorkflowId: 'landscape-review',
    });
  });

  it('rejects application locator changes through ordinary Renderer configuration updates', async () => {
    const service = createService({ inspect: vi.fn(async () => readyInspection()) });

    await expect(
      service.updateBinding('window-1', {
        integrationId: 'comfyui',
        applicationLocator: {
          kind: 'application-identity',
          identity: 'com.todesktop.241012ess7yxs0e',
        },
        launchPreference: 'reuse-qualified',
      }),
    ).rejects.toMatchObject({ code: 'professional-application-binding-rejected' });
  });
});

function createService(
  discovery: ProfessionalApplicationDiscoveryPort,
  profiles: readonly unknown[] = [COMFYUI_PROFESSIONAL_APPLICATION_PROFILE],
) {
  return createProfessionalApplicationService({
    profiles,
    bindings: createInMemoryProfessionalApplicationBindingRepository(),
    discovery,
    launcher: {
      launch: vi.fn(async () => ({ targetIdentity: 'comfyui-window-1' })),
      transfer: vi.fn(async () => ({ targetIdentity: 'comfyui-window-1', accepted: true })),
    },
    contentAuthorization: {
      authorize: vi.fn(async () => ({ authorizationId: 'authorization-1' })),
    },
  });
}
