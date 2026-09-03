import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeCoreLocalMetadataTables } from '@neko/local-metadata/sqlite';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { resolveGlobalStorageLayout } from '@neko/local-metadata';

import {
  createInMemoryProfessionalApplicationBindingRepository,
  createPersistentProfessionalApplicationBindingRepository,
  createProfessionalApplicationService,
  initializeProfessionalApplicationBindingTables,
  type ProfessionalApplicationDiscoveryPort,
} from './index';
import { COMFYUI_PROFESSIONAL_APPLICATION_PROFILE } from './profiles/comfyui';

const TEST_HANDOFF_PROFILE = {
  ...COMFYUI_PROFESSIONAL_APPLICATION_PROFILE,
  id: 'test-image-editor',
  name: 'Test image editor',
  operations: [
    ...COMFYUI_PROFESSIONAL_APPLICATION_PROFILE.operations,
    {
      id: 'test-image-editor.send-input',
      label: 'Send to test image editor…',
      kind: 'resource-handoff' as const,
      transport: 'host' as const,
      effect: 'input' as const,
      requiresApproval: true,
      verification: 'launch-receipt' as const,
      inputMimeTypes: ['image/*'],
    },
  ],
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

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

  it('provides a generic semantic image handoff and transfers only an authorized locator', async () => {
    const discovery: ProfessionalApplicationDiscoveryPort = {
      inspect: vi.fn(async () => ({
        ...readyInspection(),
        integrationId: TEST_HANDOFF_PROFILE.id,
        availableOperationIds: TEST_HANDOFF_PROFILE.operations.map((operation) => operation.id),
      })),
    };
    const authorize = vi.fn(async () => ({ authorizationId: 'authorization-1' }));
    const transfer = vi.fn(async () => ({ targetIdentity: 'comfyui-window-1', accepted: true }));
    const service = createProfessionalApplicationService({
      profiles: [TEST_HANDOFF_PROFILE],
      bindings: createInMemoryProfessionalApplicationBindingRepository([
        { integrationId: TEST_HANDOFF_PROFILE.id, launchPreference: 'reuse-qualified' },
      ]),
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
        integrationId: TEST_HANDOFF_PROFILE.id,
        operationId: 'test-image-editor.send-input',
        label: 'Send to test image editor…',
        source,
      },
    ]);
    await expect(
      service.handoff({
        handoffId: 'handoff-1',
        integrationId: TEST_HANDOFF_PROFILE.id,
        operationId: 'test-image-editor.send-input',
        source,
        locator: { file: { authority: 'workspace', path: 'neko/generated/image-1.png' } },
      }),
    ).resolves.toEqual({
      handoffId: 'handoff-1',
      integrationId: TEST_HANDOFF_PROFILE.id,
      operationId: 'test-image-editor.send-input',
      status: 'transferred',
      targetIdentity: 'comfyui-window-1',
    });
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(transfer).toHaveBeenCalledWith(
      expect.objectContaining({ authorizationId: 'authorization-1' }),
    );
    expect(JSON.stringify(transfer.mock.calls)).not.toContain('neko/generated/image-1.png');
  });

  it('does not treat an unrelated advertised operation as launch availability', async () => {
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

  it('binds only an exact application identity and preserves launcher configuration', async () => {
    const bindings = createInMemoryProfessionalApplicationBindingRepository([
      {
        integrationId: 'comfyui',
        launchPreference: 'launch-new',
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
      launchPreference: 'launch-new',
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
      launchPreference: 'reuse-qualified',
    });
    expect(await bindings.get('comfyui')).toMatchObject({
      applicationLocator: {
        kind: 'application-identity',
        identity: 'com.todesktop.241012ess7yxs0e',
      },
      launchPreference: 'reuse-qualified',
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

  it('adds, disables and removes one binding without changing sibling profiles', async () => {
    const bindings = createInMemoryProfessionalApplicationBindingRepository();
    const service = createProfessionalApplicationService({
      profiles: [COMFYUI_PROFESSIONAL_APPLICATION_PROFILE],
      bindings,
      discovery: { inspect: vi.fn(async () => readyInspection()) },
      launcher: {
        launch: vi.fn(async () => ({ targetIdentity: 'comfyui-window-1' })),
        transfer: vi.fn(),
      },
      contentAuthorization: { authorize: vi.fn() },
    });

    expect((await service.addBinding('window-1', 'comfyui')).items[0]).toMatchObject({
      enabled: true,
      binding: { integrationId: 'comfyui' },
    });
    expect((await service.setEnabled('window-1', 'comfyui', false)).items[0]).toMatchObject({
      enabled: false,
    });
    await expect(service.launch('comfyui')).rejects.toMatchObject({
      code: 'professional-application-operation-unavailable',
    });
    expect((await service.removeBinding('window-1', 'comfyui')).items[0]).toMatchObject({
      enabled: false,
    });
    expect(await bindings.get('comfyui')).toBeUndefined();
  });

  it('persists enablement and exact removal across repository reopen', async () => {
    const home = await mkdtemp(join(tmpdir(), 'neko-professional-apps-'));
    temporaryDirectories.push(home);
    const databasePath = resolveGlobalStorageLayout(home).database;
    const first = createNodeSqliteLocalMetadataStore({ homedir: home });
    await first.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(first);
    await initializeProfessionalApplicationBindingTables(first);
    const firstRepository = createPersistentProfessionalApplicationBindingRepository({
      store: first,
    });
    await firstRepository.set({
      integrationId: 'comfyui',
      launchPreference: 'reuse-qualified',
    });
    await firstRepository.setEnabled('comfyui', false);
    await first.dispose();

    const reopened = createNodeSqliteLocalMetadataStore({ homedir: home });
    await reopened.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(reopened);
    await initializeProfessionalApplicationBindingTables(reopened);
    const reopenedRepository = createPersistentProfessionalApplicationBindingRepository({
      store: reopened,
    });
    await expect(reopenedRepository.get('comfyui')).resolves.toMatchObject({
      integrationId: 'comfyui',
    });
    await expect(reopenedRepository.getEnabled('comfyui')).resolves.toBe(false);
    await reopenedRepository.remove('comfyui');
    await reopened.dispose();

    const removed = createNodeSqliteLocalMetadataStore({ homedir: home });
    await removed.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(removed);
    await initializeProfessionalApplicationBindingTables(removed);
    const removedRepository = createPersistentProfessionalApplicationBindingRepository({
      store: removed,
    });
    await expect(removedRepository.get('comfyui')).resolves.toBeUndefined();
    await expect(removedRepository.getEnabled('comfyui')).resolves.toBe(true);
    await removed.dispose();
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
