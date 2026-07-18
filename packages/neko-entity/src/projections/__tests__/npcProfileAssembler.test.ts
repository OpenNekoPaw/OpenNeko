import { describe, expect, it } from 'vitest';
import type {
  CreativeEntity,
  CreativeEntityCandidate,
  CreativeEntityOccurrenceProjection,
  CreativeEntityRef,
  CreativeEntityRelationshipProjection,
  EntityAssetBinding,
  VisualIdentityDraft,
} from '@neko/shared';
import { isNpcProfileSource } from '@neko/shared';
import { NpcProfileAssembler, type NpcProfileAssemblerReaders } from '../npcProfileAssembler';

const projectRoot = '/workspace/neko-test';
const entityRef: CreativeEntityRef = {
  entityId: 'char_xiaoju',
  entityKind: 'character',
  projectRoot,
  source: 'neko-entity',
};

function character(overrides: Partial<CreativeEntity> = {}): CreativeEntity {
  return {
    id: 'char_xiaoju',
    kind: 'character',
    canonicalName: '小橘',
    aliases: ['Xiaoju'],
    status: 'confirmed',
    ...overrides,
  };
}

describe('NpcProfileAssembler', () => {
  it('assembles a thin profile from identity only', async () => {
    const assembler = new NpcProfileAssembler({
      getEntity: async () => character(),
    });

    const result = await assembler.assembleProfile({ entityRef });

    expect(result.status).toBe('assembled');
    if (result.status !== 'assembled') return;
    expect(isNpcProfileSource(result.profile)).toBe(true);
    expect(result.profile.sparsity).toBe('thin');
    expect(result.profile.facts).toEqual([
      expect.objectContaining({
        key: 'identity.name',
        value: '小橘',
        source: 'registry',
        authority: 'confirmed',
      }),
    ]);
    expect(result.profile.sparsityScore?.missingFactKeys).toEqual(
      expect.arrayContaining(['metadata.role', 'relationships', 'dialogueSamples']),
    );
  });

  it('assembles a partial profile from role, bindings, and visual facts', async () => {
    const assembler = new NpcProfileAssembler({
      getEntity: async () =>
        character({
          metadata: { role: 'protagonist', gender: 'female', ageRange: '16-18' },
        }),
      listBindings: async () => [
        {
          id: 'binding-portrait',
          entityId: 'char_xiaoju',
          entityKind: 'character',
          assetRef: 'project://assets/xiaoju-portrait',
          role: 'portrait',
          status: 'confirmed',
          availability: 'active',
          source: 'user',
          isDefault: true,
          updatedAt: '2026-06-01T00:00:00.000Z',
        } satisfies EntityAssetBinding,
      ],
      listVisualDrafts: async () => [
        {
          id: 'draft-1',
          characterId: 'char_xiaoju',
          source: 'agent',
          prompt: 'orange jacket, short hair',
          generatedAssetIds: ['asset-1'],
          status: 'selected',
          extractedVisualFacts: [
            { key: 'outfit', value: 'orange jacket', confidence: 0.9, accepted: true },
          ],
        } satisfies VisualIdentityDraft,
      ],
    });

    const result = await assembler.assembleProfile({ entityRef });

    expect(result.status).toBe('assembled');
    if (result.status !== 'assembled') return;
    expect(result.profile.sparsity).toBe('partial');
    expect(result.profile.representationBindings).toEqual([
      expect.objectContaining({
        role: 'portrait',
        assetRef: 'project://assets/xiaoju-portrait',
        isDefault: true,
      }),
    ]);
    expect(result.profile.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'metadata.role', authority: 'confirmed' }),
        expect.objectContaining({ key: 'metadata.gender', authority: 'confirmed' }),
        expect.objectContaining({
          key: 'visual.outfit',
          value: 'orange jacket',
          source: 'visual-draft',
        }),
      ]),
    );
  });

  it('assembles a rich profile with relationships, occurrences, dialogue, assets, and suggestions', async () => {
    const relationshipTarget: CreativeEntityRef = {
      entityId: 'char_laozhang',
      entityKind: 'character',
    };
    const occurrences: readonly CreativeEntityOccurrenceProjection[] = [
      {
        entityRef,
        label: '小橘 enters the workshop',
        source: {
          sourceId: 'fountain-content',
          sourceKind: 'story',
          sourceRef: 'story/test.fountain:12',
          providerId: 'fountain-content',
        },
        role: 'reference',
        location: 'story/test.fountain:12',
        detail: '小橘：「我想先看看那里有什么。」',
      },
    ];
    const relationships: readonly CreativeEntityRelationshipProjection[] = [
      {
        from: entityRef,
        to: relationshipTarget,
        type: 'mentor',
        strength: 'strong',
        confidence: 0.8,
        source: {
          sourceId: 'fountain-content',
          sourceKind: 'story',
          sourceRef: 'story/test.fountain:20',
          providerId: 'fountain-content',
        },
      },
    ];
    const assembler = new NpcProfileAssembler({
      getEntity: async () =>
        character({
          metadata: {
            role: 'protagonist',
            personality: 'curious and direct',
            dialogueSamples: ['小橘：我会自己确认。'],
          },
        }),
      listBindings: async () => [
        {
          id: 'binding-voice',
          entityId: 'char_xiaoju',
          entityKind: 'character',
          assetRef: 'project://assets/xiaoju-voice',
          role: 'voice',
          status: 'confirmed',
          availability: 'active',
          source: 'user',
          updatedAt: '2026-06-01T00:00:00.000Z',
        } satisfies EntityAssetBinding,
      ],
      listRelationships: async () => relationships,
      listOccurrences: async () => occurrences,
      describeAsset: async () => ({
        assetRef: 'project://assets/xiaoju-voice',
        summary: 'Warm, quick voice',
      }),
    });

    const result = await assembler.assembleProfile({
      entityRef,
      userSupplements: 'The user thinks 小橘 should sound slightly impatient.',
      suggestedFacts: [
        {
          key: 'speech.catchphrase',
          value: '我先看看',
          source: 'agent-inferred',
          authority: 'suggested',
          confidence: 0.7,
        },
      ],
    });

    expect(result.status).toBe('assembled');
    if (result.status !== 'assembled') return;
    expect(result.profile.sparsity).toBe('rich');
    expect(result.profile.dialogueSamples).toEqual([
      '小橘：我会自己确认。',
      '小橘：「我想先看看那里有什么。」',
    ]);
    expect(result.profile.sceneAppearances).toEqual(['story/test.fountain:12']);
    expect(result.profile.relationships).toEqual([
      expect.objectContaining({
        key: 'relationship.char_laozhang.mentor',
        source: 'relationship-graph',
        authority: 'confirmed',
      }),
    ]);
    expect(result.profile.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'asset.voice.summary', source: 'asset-metadata' }),
        expect.objectContaining({
          key: 'user.supplement',
          source: 'user-supplement',
          authority: 'suggested',
        }),
        expect.objectContaining({
          key: 'speech.catchphrase',
          source: 'agent-inferred',
          authority: 'suggested',
        }),
      ]),
    );
  });

  it('returns missing-entity for unresolved entity refs', async () => {
    const assembler = new NpcProfileAssembler({
      getEntity: async () => undefined,
    });

    const result = await assembler.assembleProfile({ entityRef });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'missing-entity',
        entityRef,
      }),
    );
  });

  it('assembles candidate entities without persisting a CharacterCard', async () => {
    const candidate: CreativeEntityCandidate = {
      id: 'candidate:character:char_xiaoju',
      kind: 'character',
      name: '小橘',
      aliases: ['Xiaoju'],
      status: 'open',
      identityBasis: 'user-named',
      provenance: [
        {
          providerId: 'fountain-content',
          sourceKind: 'story',
          sourceRef: 'story/test.fountain:12',
        },
      ],
      sourceRefs: ['story/test.fountain:12'],
    };
    const assembler = new NpcProfileAssembler({
      getEntity: async () => undefined,
      getCandidate: async () => candidate,
    });

    const result = await assembler.assembleProfile({
      entityRef: { ...entityRef, entityId: candidate.id },
    });

    expect(result.status).toBe('assembled');
    if (result.status !== 'assembled') return;
    expect(result.profile.entityRef.entityId).toBe(candidate.id);
    expect(result.profile.displayName).toBe('小橘');
    expect(result.profile.facts).toEqual([
      expect.objectContaining({
        key: 'identity.name',
        source: 'registry',
        authority: 'confirmed',
      }),
    ]);
  });

  it('reports provider-unavailable when an injected evidence reader fails', async () => {
    const readers: NpcProfileAssemblerReaders = {
      getEntity: async () => character(),
      listOccurrences: async () => {
        throw new Error('Story index unavailable');
      },
    };
    const assembler = new NpcProfileAssembler(readers);

    const result = await assembler.assembleProfile({ entityRef });

    expect(result).toEqual({
      status: 'provider-unavailable',
      entityRef,
      provider: 'listOccurrences',
      reason: 'Story index unavailable',
    });
  });
});
