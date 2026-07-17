import { describe, expect, it, vi } from 'vitest';
import { CreativeEntityService } from '../core/CreativeEntityService';
import {
  resolveCharacterRegistryPath,
  resolveEntityAssetBindingsPath,
  resolveEntityCandidateFilePath,
  resolveProjectEntityFilePath,
} from '../core/paths';
import { MemoryEntityFileStore, createFixedClock } from '../testing';

const projectRoot = '/workspace/neko-test';
const now = '2026-05-18T00:00:00.000Z';

describe('CreativeEntityService', () => {
  it('preserves characters.json compatibility and resolves Chinese names', async () => {
    const files = new MemoryEntityFileStore({
      [resolveCharacterRegistryPath(projectRoot)]: {
        version: 1,
        characters: [
          {
            id: 'char_xiaoju',
            canonicalName: '小橘',
            displayName: '小橘',
            aliases: ['Xiaoju'],
            status: 'confirmed',
            bindings: { scriptNames: ['小橘同学'] },
          },
        ],
      },
    });
    const events = { emit: vi.fn() };
    const service = new CreativeEntityService({
      projectRoot,
      ports: { files, clock: createFixedClock(now), events },
    });

    await expect(service.list({ kind: 'character' })).resolves.toEqual([
      expect.objectContaining({
        id: 'char_xiaoju',
        kind: 'character',
        canonicalName: '小橘',
      }),
    ]);
    await expect(service.resolveByName('小橘同学', 'character')).resolves.toEqual(
      expect.objectContaining({ id: 'char_xiaoju' }),
    );

    await service.renameEntity({
      entityId: 'char_xiaoju',
      canonicalName: '橘子',
      keepPreviousAsAlias: true,
    });

    expect(files.get(resolveCharacterRegistryPath(projectRoot))).toEqual({
      version: 1,
      characters: [
        expect.objectContaining({
          id: 'char_xiaoju',
          canonicalName: '橘子',
          aliases: ['Xiaoju', '小橘'],
          bindings: { scriptNames: ['小橘同学'] },
        }),
      ],
    });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot,
        reason: 'rename',
        changedRefs: [
          expect.objectContaining({
            kind: 'entity',
            id: 'char_xiaoju',
            factRef: resolveCharacterRegistryPath(projectRoot),
          }),
        ],
      }),
    );
  });

  it('writes non-character entities to git-trackable project entity facts', async () => {
    const files = new MemoryEntityFileStore();
    const service = new CreativeEntityService({
      projectRoot,
      ports: { files, clock: createFixedClock(now) },
    });

    const result = await service.createEntity({
      kind: 'location',
      canonicalName: '天台',
      aliases: ['rooftop'],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        action: 'create',
        affectedEntityRefs: [
          expect.objectContaining({ entityId: 'location_天台', entityKind: 'location' }),
        ],
      }),
    );
    expect(files.get(resolveProjectEntityFilePath(projectRoot, 'location'))).toEqual({
      version: 1,
      kind: 'location',
      entities: [
        expect.objectContaining({
          id: 'location_天台',
          kind: 'location',
          canonicalName: '天台',
          aliases: ['rooftop'],
          status: 'confirmed',
        }),
      ],
    });
    expect(JSON.stringify(files.writes)).not.toContain('.neko/.cache');
  });

  it('keeps candidates explicit until confirmation and routes by kind on confirm', async () => {
    const files = new MemoryEntityFileStore();
    const service = new CreativeEntityService({
      projectRoot,
      ports: { files, clock: createFixedClock(now) },
    });

    const candidate = await service.proposeCandidate({
      kind: 'character',
      name: '小橘',
      provenance: [
        {
          providerId: 'neko-story',
          sourceKind: 'story',
          sourceRef: 'cases/test.fountain:8',
          confidence: 0.91,
        },
      ],
    });

    expect(files.get(resolveCharacterRegistryPath(projectRoot))).toBeUndefined();
    expect(files.get(resolveEntityCandidateFilePath(projectRoot))).toEqual({
      version: 1,
      candidates: [expect.objectContaining({ id: candidate.id, status: 'open', name: '小橘' })],
    });

    await service.confirmCandidate({ candidateId: candidate.id, aliases: ['Xiaoju'] });

    expect(files.get(resolveCharacterRegistryPath(projectRoot))).toEqual({
      version: 1,
      characters: [
        expect.objectContaining({
          id: 'char_小橘',
          canonicalName: '小橘',
          aliases: ['Xiaoju'],
          status: 'confirmed',
        }),
      ],
    });
    expect(files.get(resolveEntityCandidateFilePath(projectRoot))).toEqual({
      version: 1,
      candidates: [
        expect.objectContaining({
          id: candidate.id,
          status: 'confirmed',
          resolvedEntityRef: expect.objectContaining({ entityId: 'char_小橘' }),
        }),
      ],
    });
  });

  it('merges candidates as aliases without mutating source text', async () => {
    const files = new MemoryEntityFileStore();
    const service = new CreativeEntityService({
      projectRoot,
      ports: { files, clock: createFixedClock(now) },
    });
    await service.createEntity({ kind: 'character', canonicalName: '小橘', id: 'char_xiaoju' });
    const candidate = await service.proposeCandidate({
      kind: 'character',
      name: '橘子',
      provenance: [{ providerId: 'neko-story', sourceKind: 'story', sourceRef: 'test.fountain:3' }],
    });

    await service.mergeCandidateIntoExisting({
      candidateId: candidate.id,
      entityId: 'char_xiaoju',
    });

    expect(files.get(resolveCharacterRegistryPath(projectRoot))).toEqual({
      version: 1,
      characters: [
        expect.objectContaining({
          id: 'char_xiaoju',
          canonicalName: '小橘',
          aliases: ['橘子'],
        }),
      ],
    });
    expect(JSON.stringify(files.writes)).toContain('test.fountain:3');
    expect(JSON.stringify(files.writes)).not.toContain('rewrite');
  });

  it('retargets entity-owned facts on conservative merge', async () => {
    const files = new MemoryEntityFileStore({
      [resolveEntityAssetBindingsPath(projectRoot)]: {
        version: 1,
        bindings: [
          {
            id: 'binding-source',
            entityId: 'char_duplicate',
            entityKind: 'character',
            assetRef: 'project://assets/dupe',
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: now,
          },
        ],
      },
    });
    const service = new CreativeEntityService({
      projectRoot,
      ports: { files, clock: createFixedClock(now) },
    });
    await service.createEntity({ kind: 'character', canonicalName: '小橘', id: 'char_xiaoju' });
    await service.createEntity({ kind: 'character', canonicalName: '小桔', id: 'char_duplicate' });

    const result = await service.mergeEntities({
      sourceEntityId: 'char_duplicate',
      targetEntityId: 'char_xiaoju',
    });

    expect(result.survivingEntityRef).toEqual(
      expect.objectContaining({ entityId: 'char_xiaoju', entityKind: 'character' }),
    );
    expect(files.get(resolveEntityAssetBindingsPath(projectRoot))).toEqual({
      version: 1,
      bindings: [
        expect.objectContaining({
          id: 'binding-source',
          entityId: 'char_xiaoju',
          entityKind: 'character',
        }),
      ],
    });
    await expect(service.get('char_duplicate')).resolves.toEqual(
      expect.objectContaining({
        status: 'deprecated',
        metadata: expect.objectContaining({ mergedIntoEntityId: 'char_xiaoju' }),
      }),
    );
  });

  it('marks, restores, and archives bindings without changing review status', async () => {
    const files = new MemoryEntityFileStore({
      [resolveCharacterRegistryPath(projectRoot)]: {
        version: 1,
        characters: [
          {
            id: 'char_xiaoju',
            canonicalName: '小橘',
            aliases: [],
            status: 'confirmed',
          },
        ],
      },
      [resolveEntityAssetBindingsPath(projectRoot)]: {
        version: 1,
        bindings: [
          {
            id: 'binding-portrait',
            entityId: 'char_xiaoju',
            entityKind: 'character',
            assetRef: 'project://assets/xiaoju-portrait',
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: now,
          },
        ],
      },
    });
    const events = { emit: vi.fn() };
    const service = new CreativeEntityService({
      projectRoot,
      ports: { files, clock: createFixedClock(now), events },
    });

    const orphaned = await service.markBindingsOrphaned({
      bindingIds: ['binding-portrait'],
      orphanedAt: '2026-06-10T01:00:00.000Z',
    });

    expect(orphaned).toEqual(
      expect.objectContaining({
        action: 'mark-binding-orphaned',
        changedRefs: [
          expect.objectContaining({
            kind: 'binding',
            id: 'binding-portrait',
            entityRef: expect.objectContaining({ entityId: 'char_xiaoju' }),
          }),
        ],
      }),
    );
    expect(files.get(resolveEntityAssetBindingsPath(projectRoot))).toEqual({
      version: 1,
      bindings: [
        expect.objectContaining({
          id: 'binding-portrait',
          status: 'confirmed',
          availability: 'orphaned',
          orphanedAt: '2026-06-10T01:00:00.000Z',
        }),
      ],
    });

    await service.restoreOrphanedBindings({ bindingIds: ['binding-portrait'] });
    expect(files.get(resolveEntityAssetBindingsPath(projectRoot))).toEqual({
      version: 1,
      bindings: [
        expect.not.objectContaining({
          orphanedAt: expect.any(String),
        }),
      ],
    });
    expect(files.get(resolveEntityAssetBindingsPath(projectRoot))).toEqual({
      version: 1,
      bindings: [
        expect.objectContaining({
          status: 'confirmed',
          availability: 'active',
        }),
      ],
    });

    await service.archiveBindings({ bindingIds: ['binding-portrait'] });
    expect(files.get(resolveEntityAssetBindingsPath(projectRoot))).toEqual({
      version: 1,
      bindings: [
        expect.objectContaining({
          status: 'confirmed',
          availability: 'archived',
        }),
      ],
    });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'mark-binding-orphaned' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'restore-binding' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'archive-binding' }),
    );
  });

  it('names anonymous candidates after duplicate checks', async () => {
    const files = new MemoryEntityFileStore({
      [resolveCharacterRegistryPath(projectRoot)]: {
        version: 1,
        characters: [
          {
            id: 'char_existing',
            canonicalName: '既存',
            aliases: [],
            status: 'confirmed',
          },
        ],
      },
    });
    const service = new CreativeEntityService({
      projectRoot,
      ports: { files, clock: createFixedClock(now) },
    });
    const candidate = await service.proposeCandidate({
      id: 'candidate:visual:1',
      kind: 'character',
      name: '',
      identityBasis: 'visual',
      provenance: [{ providerId: 'canvas', sourceKind: 'canvas' }],
    });

    await expect(
      service.nameCandidate({ candidateId: candidate.id, name: '既存' }),
    ).rejects.toThrow(/already exists/);

    await service.nameCandidate({ candidateId: candidate.id, name: '新角色', aliases: ['Shin'] });

    expect(files.get(resolveEntityCandidateFilePath(projectRoot))).toEqual({
      version: 1,
      candidates: [
        expect.objectContaining({
          id: candidate.id,
          name: '新角色',
          aliases: ['Shin'],
          identityBasis: 'user-named',
        }),
      ],
    });
  });
});
