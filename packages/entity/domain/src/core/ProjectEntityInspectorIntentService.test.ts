import { describe, expect, it, vi } from 'vitest';
import {
  ProjectEntityInspectorIntentService,
  type ProjectEntityInspectorAssetPort,
  type ProjectEntityInspectorInteractionPort,
  type ProjectEntityInspectorLifecyclePort,
} from './ProjectEntityInspectorIntentService';

describe('ProjectEntityInspectorIntentService', () => {
  it('adds Host-owned identity, time, and binding authority to semantic operations', async () => {
    const operations = createOperations();
    const service = createService({ operations });

    await service.execute({
      type: 'confirm',
      candidateId: 'candidate-rin',
      accepted: {
        kind: 'character',
        names: { canonical: 'Rin', aliases: [] },
        facts: { role: 'lead' },
      },
    });
    await service.execute({
      type: 'bind',
      entityId: 'entity-rin',
      binding: {
        role: 'portrait',
        target: { kind: 'workspace-file', path: 'rin.png' },
        isDefault: true,
      },
    });

    expect(operations.confirmCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'entity:candidate-rin',
        createdAt: NOW,
        semantic: expect.objectContaining({ representations: [] }),
      }),
      undefined,
    );
    expect(operations.bind).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: expect.objectContaining({
          bindingId: 'binding:entity-rin',
          source: 'user',
          acceptedAt: NOW,
        }),
        updatedAt: NOW,
      }),
      undefined,
    );
  });

  it('routes lifecycle, Asset, and interaction intents only to their exact owners', async () => {
    const lifecycle: ProjectEntityInspectorLifecyclePort = {
      merge: vi.fn(async () => undefined),
      deprecate: vi.fn(async () => undefined),
    };
    const assets: ProjectEntityInspectorAssetPort = {
      instantiate: vi.fn(async () => undefined),
      publish: vi.fn(async () => undefined),
      diff: vi.fn(async () => undefined),
      applyUpdate: vi.fn(async () => undefined),
    };
    const interactions: ProjectEntityInspectorInteractionPort = {
      reference: vi.fn(async () => undefined),
      startCharacterDialogue: vi.fn(async () => undefined),
      openRoom: vi.fn(async () => undefined),
      embodyCharacter: vi.fn(async () => undefined),
    };
    const service = createService({ lifecycle, assets, interactions });

    await service.execute({
      type: 'merge',
      sourceEntityId: 'entity-old',
      targetEntityId: 'entity-rin',
    });
    await service.execute({
      type: 'publish',
      entityId: 'entity-rin',
    });
    await service.execute({
      type: 'character-dialogue',
      entityId: 'entity-rin',
      characterId: 'character-rin',
    });

    expect(lifecycle.merge).toHaveBeenCalledOnce();
    expect(assets.publish).toHaveBeenCalledOnce();
    expect(interactions.startCharacterDialogue).toHaveBeenCalledOnce();
  });

  it('fails visibly when an owner is not configured', async () => {
    const service = createService();
    await expect(
      service.execute({
        type: 'room-open',
        entityId: 'entity-rin',
        roomId: 'room-story',
      }),
    ).rejects.toMatchObject({
      diagnostics: [{ code: 'project-entity-operation-invalid' }],
    });
  });
});

function createOperations() {
  return {
    confirmCandidate: vi.fn(async () => document()),
    edit: vi.fn(async () => document()),
    bind: vi.fn(async () => document()),
    unbind: vi.fn(async () => document()),
  };
}

function createService(
  overrides: Partial<ConstructorParameters<typeof ProjectEntityInspectorIntentService>[0]> = {},
) {
  return new ProjectEntityInspectorIntentService({
    operations: createOperations(),
    createEntityId: (candidateId) => `entity:${candidateId}`,
    createBindingId: (entityId) => `binding:${entityId}`,
    now: () => NOW,
    ...overrides,
  });
}

function document() {
  return { projectId: 'project-neko', entities: [] };
}

const NOW = '2026-08-05T00:00:00.000Z';
