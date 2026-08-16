import { describe, expect, it } from 'vitest';
import type {
  CreativeEntityOccurrenceProjection,
  CreativeEntityRef,
  CreativeEntityRelationshipProjection,
  ProjectEntityRecord,
} from '@neko/entity-domain';
import { isNpcProfileSource } from '@neko/chara/contracts';
import {
  NpcProfileAssembler,
  type NpcProfileAssemblerReaders,
} from '../core/npc-profile-assembler';

const projectRoot = '/workspace/neko-test';
const entityRef: CreativeEntityRef = {
  entityId: 'char_xiaoju',
  entityKind: 'character',
  projectRoot,
  source: 'neko-entity',
};

function character(overrides: Partial<ProjectEntityRecord> = {}): ProjectEntityRecord {
  return {
    entityId: 'char_xiaoju',
    kind: 'character',
    names: { canonical: '小橘', aliases: ['Xiaoju'] },
    lifecycle: { state: 'active' },
    representations: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
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

  it('uses accepted Entity representations without treating Entity as Character facts', async () => {
    const assembler = new NpcProfileAssembler({
      getEntity: async () =>
        character({
          representations: [
            {
              bindingId: 'binding-portrait',
              target: {
                kind: 'workspace-file',
                path: 'neko/assets/Characters/xiaoju-portrait.png',
              },
              role: 'portrait',
              source: 'user',
              isDefault: true,
              acceptedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        }),
    });

    const result = await assembler.assembleProfile({ entityRef });

    expect(result.status).toBe('assembled');
    if (result.status !== 'assembled') return;
    expect(result.profile.sparsity).toBe('thin');
    expect(result.profile.representationBindings).toEqual([
      expect.objectContaining({
        role: 'portrait',
        representation: {
          kind: 'workspace-file',
          path: 'neko/assets/Characters/xiaoju-portrait.png',
        },
        isDefault: true,
      }),
    ]);
    expect(result.profile.facts).toEqual([
      expect.objectContaining({ key: 'identity.name', authority: 'confirmed' }),
    ]);
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
          representations: [
            {
              bindingId: 'binding-voice',
              target: {
                kind: 'workspace-file',
                path: 'neko/assets/Characters/xiaoju-voice.wav',
              },
              role: 'voice',
              source: 'user',
              acceptedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        }),
      listRelationships: async () => relationships,
      listOccurrences: async () => occurrences,
      describeRepresentation: async () => ({
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
    expect(result.profile.dialogueSamples).toEqual(['小橘：「我想先看看那里有什么。」']);
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
        expect.objectContaining({
          key: 'representation.voice.summary',
          source: 'representation-metadata',
        }),
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

  it('does not promote an unconfirmed candidate into an Entity-backed profile', async () => {
    const assembler = new NpcProfileAssembler({
      getEntity: async () => undefined,
    });

    const result = await assembler.assembleProfile({
      entityRef: { ...entityRef, entityId: 'candidate:character:char_xiaoju' },
    });

    expect(result).toMatchObject({
      status: 'missing-entity',
      entityRef: { entityId: 'candidate:character:char_xiaoju' },
    });
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
