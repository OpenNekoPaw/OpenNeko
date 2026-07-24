import { describe, expect, it } from 'vitest';
import type {
  EntityAssetProjectionRecord,
  EntityAssetProjectionReplaceSourceRequest,
  EntityAssetProjectionRepository,
} from '@neko/shared';
import { EntityAssetMetadataProjector } from '../entityAssetMetadataProjection';

const partition = {
  scope: 'workspace' as const,
  workspaceId: '36967dfd-e6db-4bce-bf37-4db2ebd5371d',
  domain: 'entity-asset-projection',
};

describe('EntityAssetMetadataProjector', () => {
  it('projects candidate and binding facts without persisting Host paths', async () => {
    const requests: EntityAssetProjectionReplaceSourceRequest[] = [];
    const projector = new EntityAssetMetadataProjector({
      partition,
      repository: createRepository(requests),
      listCandidates: async () => [
        {
          id: 'candidate:rin',
          kind: 'character',
          name: 'Rin',
          status: 'open',
          identityBasis: 'user-named',
          provenance: [
            {
              providerId: 'story',
              sourceKind: 'story',
              sourceRef: 'story/main.fountain:12',
              metadata: { projectRoot: '/workspace' },
            },
          ],
          sourceRefs: ['story/main.fountain:12'],
          metadata: { projectRoot: '/workspace', review: 'needed' },
        },
      ],
      listBindings: async () => [
        {
          id: 'binding:rin-portrait',
          entityId: 'char_rin',
          entityKind: 'character',
          representation: { kind: 'workspace-file', path: 'neko/assets/rin.png' },
          role: 'portrait',
          status: 'confirmed',
          availability: 'active',
          isDefault: true,
          source: 'user',
          updatedAt: '2026-07-13T07:30:00.000Z',
        },
      ],
      now: () => '2026-07-13T08:00:00.000Z',
    });

    await projector.refreshFacts();

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ sourceId: 'neko-entity-facts', partition });
    expect(requests[0]?.records).toEqual([
      expect.objectContaining({
        kind: 'binding-availability',
        entityId: 'char_rin',
        value: expect.objectContaining({
          representation: { kind: 'workspace-file', path: 'neko/assets/rin.png' },
        }),
      }),
      expect.objectContaining({
        kind: 'entity-candidate',
        candidateId: 'candidate:rin',
        value: expect.objectContaining({ metadata: { review: 'needed' } }),
      }),
    ]);
    expect(JSON.stringify(requests)).not.toContain('/workspace');
  });

  it('projects provider occurrences and relationships as one replaceable source', async () => {
    const requests: EntityAssetProjectionReplaceSourceRequest[] = [];
    const projector = new EntityAssetMetadataProjector({
      partition,
      repository: createRepository(requests),
      listCandidates: async () => [],
      listBindings: async () => [],
      now: () => '2026-07-13T08:00:00.000Z',
    });

    await projector.replaceProviderSnapshot('story-provider', {
      statuses: [],
      candidates: [],
      occurrences: [
        {
          entityRef: {
            entityId: 'char_rin',
            entityKind: 'character',
            projectRoot: '/workspace',
          },
          label: 'Rin',
          source: {
            sourceId: 'story-main',
            sourceKind: 'story',
            sourceRef: 'story/main.fountain:12',
            freshness: 'fresh',
          },
          role: 'reference',
          location: 'story/main.fountain:12',
        },
      ],
      relationships: [
        {
          from: {
            entityId: 'char_rin',
            entityKind: 'character',
            projectRoot: '/workspace',
          },
          to: {
            entityId: 'location_city',
            entityKind: 'location',
            projectRoot: '/workspace',
          },
          type: 'appears-in-scene',
          source: { sourceId: 'story-main', sourceKind: 'story', freshness: 'fresh' },
        },
      ],
      representationHints: [],
      syncSuggestions: [],
    });

    expect(requests[0]).toMatchObject({ sourceId: 'provider:story-provider', partition });
    expect(requests[0]?.records).toEqual([
      expect.objectContaining({
        kind: 'entity-occurrence',
        entityId: 'char_rin',
      }),
      expect.objectContaining({
        kind: 'entity-relationship',
        entityId: 'char_rin',
        relatedEntityId: 'location_city',
      }),
    ]);
    expect(JSON.stringify(requests)).not.toContain('/workspace');
  });
});

function createRepository(
  requests: EntityAssetProjectionReplaceSourceRequest[],
): EntityAssetProjectionRepository {
  let records: readonly EntityAssetProjectionRecord[] = [];
  return {
    list: async () => records,
    replaceSource: async (request) => {
      requests.push(request);
      records = request.records;
    },
    insertMissing: async () => ({ insertedProjectionKeys: [], preservedProjectionKeys: [] }),
  };
}
