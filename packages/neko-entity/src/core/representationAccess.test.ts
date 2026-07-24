import { describe, expect, it, vi } from 'vitest';
import type { ContentLocator, ContentReadService, EntityRepresentationBinding } from '@neko/shared';
import {
  EntityRepresentationAccessService,
  EntityRepresentationRebindService,
  suggestEntityRepresentationRebindCandidates,
} from './representationAccess';
import { EntityRepresentationResolver } from './representationResolver';

const representations = [
  { kind: 'workspace-file', path: 'neko/assets/Characters/xiaoju.png' },
  {
    kind: 'document-entry',
    source: { kind: 'workspace-file', path: 'neko/assets/Books/comic.epub' },
    entryPath: 'OPS/images/xiaoju.png',
  },
  {
    kind: 'generated-output',
    outputId: 'xiaoju-image',
    revision: 'revision-1',
    digest: 'sha256:xiaoju-image',
    path: 'neko/generated/xiaoju.png',
  },
  {
    kind: 'package-resource',
    packageId: 'xiaoju-live2d',
    revision: 'revision-1',
    resourcePath: 'model/xiaoju.model3.json',
  },
] as const satisfies readonly ContentLocator[];

describe('EntityRepresentationAccessService', () => {
  it('passes every representation locator unchanged to the content owner port', async () => {
    for (const representation of representations) {
      const binding = createBinding(representation);
      const read = vi.fn(async (locator: ContentLocator) => ({
        status: 'ready' as const,
        locator,
        bytes: new Uint8Array([1]),
        offset: 0,
        totalByteLength: 1,
        fingerprint: { strategy: 'provider' as const, value: 'owner:v1' },
      }));
      const service = createAccessService([binding], { read });

      await expect(
        service.read({ entityId: 'char_xiaoju', consumer: 'agent' }, { maxBytes: 16 }),
      ).resolves.toMatchObject({
        status: 'resolved',
        selection: { binding, representation },
        content: { status: 'ready', locator: representation },
      });
      expect(read).toHaveBeenCalledWith(representation, { maxBytes: 16 });
    }
  });

  it('does not call content owners when no active binding is selected', async () => {
    const read = vi.fn();
    const service = createAccessService([], { read });

    await expect(
      service.read({
        entityId: 'char_xiaoju',
        consumer: 'canvas',
        preferredRole: 'portrait',
        allowAlternativeRoles: false,
      }),
    ).resolves.toEqual({
      status: 'missing-representation',
      entityId: 'char_xiaoju',
      missingRoles: ['portrait'],
      suggestedActions: ['generate', 'bind-existing', 'dismiss'],
    });
    expect(read).not.toHaveBeenCalled();
  });
});

describe('EntityRepresentationRebindService', () => {
  it('validates content and commits a fingerprinted explicit rebind', async () => {
    const orphaned = {
      ...createBinding({
        kind: 'workspace-file' as const,
        path: 'neko/assets/Characters/missing.png',
        fingerprint: { strategy: 'sha256' as const, value: 'sha256:old' },
      }),
      availability: 'orphaned' as const,
      orphanedAt: '2026-07-22T01:00:00.000Z',
      isDefault: undefined,
    };
    const commit = vi.fn(async () => ({
      ok: true as const,
      action: 'rebind' as const,
      projectRoot: '/workspace',
      affectedEntityRefs: [],
      changedRefs: [],
      generation: 1,
      freshness: 'fresh' as const,
      updatedAt: '2026-07-22T02:00:00.000Z',
    }));
    const service = new EntityRepresentationRebindService({
      bindings: { list: async () => [orphaned] },
      content: {
        stat: async (locator) => ({
          status: 'ready',
          locator,
          byteLength: 12,
          fingerprint: { strategy: 'sha256', value: 'sha256:new' },
        }),
        read: vi.fn(),
      },
      commit,
    });

    await expect(
      service.rebind('binding-workspace-file', {
        kind: 'workspace-file',
        path: 'neko/assets/Characters/rebound.png',
      }),
    ).resolves.toMatchObject({
      status: 'rebound',
      representation: {
        kind: 'workspace-file',
        path: 'neko/assets/Characters/rebound.png',
        fingerprint: { strategy: 'sha256', value: 'sha256:new' },
      },
    });
    expect(commit).toHaveBeenCalledWith({
      bindingId: 'binding-workspace-file',
      representation: {
        kind: 'workspace-file',
        path: 'neko/assets/Characters/rebound.png',
        fingerprint: { strategy: 'sha256', value: 'sha256:new' },
      },
    });
  });

  it('does not mutate when target validation fails', async () => {
    const orphaned = {
      ...createBinding(representations[0]),
      availability: 'orphaned' as const,
      orphanedAt: '2026-07-22T01:00:00.000Z',
      isDefault: undefined,
    };
    const commit = vi.fn();
    const service = new EntityRepresentationRebindService({
      bindings: { list: async () => [orphaned] },
      content: {
        stat: async (locator) => ({
          status: 'unavailable',
          locator,
          diagnostic: { code: 'content-missing' },
        }),
        read: vi.fn(),
      },
      commit,
    });

    await expect(service.rebind(orphaned.id, representations[0])).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-missing' },
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it('suggests candidates without rewriting the binding', () => {
    const binding = {
      ...createBinding({
        kind: 'workspace-file' as const,
        path: 'old/xiaoju.png',
        fingerprint: { strategy: 'sha256' as const, value: 'sha256:xiaoju' },
      }),
      availability: 'orphaned' as const,
      orphanedAt: '2026-07-22T01:00:00.000Z',
      isDefault: undefined,
    };
    const candidates = [
      {
        kind: 'workspace-file' as const,
        path: 'new/renamed.png',
        fingerprint: { strategy: 'sha256' as const, value: 'sha256:xiaoju' },
      },
      { kind: 'workspace-file' as const, path: 'other/xiaoju.png' },
      { kind: 'workspace-file' as const, path: 'other/unrelated.png' },
    ];

    expect(suggestEntityRepresentationRebindCandidates(binding, candidates)).toEqual([
      { representation: candidates[0], evidence: ['fingerprint'], confidence: 1 },
      { representation: candidates[1], evidence: ['name'], confidence: 0.5 },
    ]);
    expect(binding.representation).toEqual({
      kind: 'workspace-file',
      path: 'old/xiaoju.png',
      fingerprint: { strategy: 'sha256', value: 'sha256:xiaoju' },
    });
  });
});

function createBinding(representation: ContentLocator): EntityRepresentationBinding {
  return {
    id: `binding-${representation.kind}`,
    entityId: 'char_xiaoju',
    entityKind: 'character',
    representation,
    role: 'reference',
    isDefault: true,
    status: 'confirmed',
    availability: 'active',
    source: 'user',
    updatedAt: '2026-07-22T00:00:00.000Z',
  };
}

function createAccessService(
  bindings: readonly EntityRepresentationBinding[],
  contentOverrides: Partial<ContentReadService>,
): EntityRepresentationAccessService {
  const resolver = new EntityRepresentationResolver({
    entities: {
      get: async () => ({
        id: 'char_xiaoju',
        kind: 'character',
        canonicalName: '小橘',
        aliases: [],
        status: 'confirmed',
      }),
      list: async () => [],
      resolveByName: async () => undefined,
    },
    bindings: { list: async () => bindings },
  });
  const content: ContentReadService = {
    stat: async (locator) => ({
      status: 'ready',
      locator,
      byteLength: 1,
      fingerprint: { strategy: 'provider', value: 'owner:v1' },
    }),
    read: async (locator) => ({
      status: 'ready',
      locator,
      bytes: new Uint8Array([1]),
      offset: 0,
      totalByteLength: 1,
      fingerprint: { strategy: 'provider', value: 'owner:v1' },
    }),
    ...contentOverrides,
  };
  return new EntityRepresentationAccessService({ resolver, content });
}
