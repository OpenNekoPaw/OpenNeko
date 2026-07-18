import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPRESENTATION_FALLBACKS,
  ENTITY_ASSET_BINDING_AVAILABILITIES,
  REPRESENTATION_FILE_ROLES,
  WELL_KNOWN_VISUAL_FACT_KEYS,
  CREATIVE_ENTITY_CANDIDATE_IDENTITY_BASES,
  isCreativeEntity,
  isCreativeEntityCandidate,
  isCreativeEntityCandidateFile,
  isCreativeEntityCandidateIdentityBasis,
  isAssetRefScheme,
  isCreativeEntityChangeEvent,
  isCreativeEntityKind,
  isCreativeEntityOperationResult,
  isCreativeEntityProviderStatus,
  isCreativeEntityRef,
  isEntityAssetBinding,
  isEntityAssetBindingAvailability,
  isEntityAssetBindingFile,
  isEntityAssetBindingRole,
  isEntityAssetRequirementFile,
  isProjectCreativeEntityFile,
  isRepresentationFileRole,
  isRepresentationKind,
  isVisualIdentityDraftFile,
  withCreativeEntityCandidateDefaults,
  withCreativeEntityCandidateFileDefaults,
  withEntityAssetBindingDefaults,
  withEntityAssetBindingFileDefaults,
  type VisualFactKey,
} from '../creative-entity-asset-composition';

describe('creative entity asset composition contracts', () => {
  it('declares target-aware fallback chains for all resolver targets', () => {
    expect(DEFAULT_REPRESENTATION_FALLBACKS).toEqual({
      canvas: ['portrait', 'reference', 'live2d', 'live3d'],
      agent: ['reference', 'portrait', 'live2d', 'live3d'],
      cut: ['video', 'live2d', 'live3d', 'portrait'],
    });
  });

  it('keeps representation file roles broad enough for live packages', () => {
    expect(REPRESENTATION_FILE_ROLES).toEqual(
      expect.arrayContaining([
        'main',
        'model',
        'texture',
        'rig',
        'skeleton',
        'physics',
        'expression',
        'motion',
        'voice',
        'calibration',
        'tracking-profile',
      ]),
    );
    expect(isRepresentationFileRole('tracking-profile')).toBe(true);
    expect(isRepresentationFileRole('unknown-role')).toBe(false);
  });

  it('validates enum-like contract values without accepting arbitrary strings', () => {
    expect(isCreativeEntityKind('character')).toBe(true);
    expect(isCreativeEntityKind('vehicle')).toBe(false);
    expect(isRepresentationKind('live2d')).toBe(true);
    expect(isRepresentationKind('puppet-bone')).toBe(false);
    expect(isRepresentationKind('avatar')).toBe(false);
    expect(isAssetRefScheme('market')).toBe(false);
    expect(isAssetRefScheme('file')).toBe(false);
    expect(isEntityAssetBindingRole('portrait')).toBe(true);
    expect(isEntityAssetBindingRole('puppet-bone')).toBe(true);
    expect(isEntityAssetBindingRole('video')).toBe(false);
    expect(CREATIVE_ENTITY_CANDIDATE_IDENTITY_BASES).toEqual([
      'user-named',
      'placeholder',
      'visual',
      'asset',
    ]);
    expect(isCreativeEntityCandidateIdentityBasis('visual')).toBe(true);
    expect(isCreativeEntityCandidateIdentityBasis('filename')).toBe(false);
    expect(ENTITY_ASSET_BINDING_AVAILABILITIES).toEqual(['active', 'orphaned', 'archived']);
    expect(isEntityAssetBindingAvailability('orphaned')).toBe(true);
    expect(isEntityAssetBindingAvailability('missing')).toBe(false);
  });

  it('validates creative entity lifecycle, candidates, and project fact contracts', () => {
    const entityRef = {
      entityId: 'char_xiaoju',
      entityKind: 'character',
      projectRoot: '${workspaceFolder}',
      source: 'neko-entity',
    };
    const candidate = {
      id: 'candidate:story:character:xiaoju',
      kind: 'character',
      name: '小橘',
      aliases: ['Xiaoju'],
      status: 'open',
      confidence: 0.92,
      provenance: [
        {
          providerId: 'fountain-content',
          sourceKind: 'story',
          sourceRef: 'cases/test.fountain:12',
          confidence: 0.92,
        },
      ],
      sourceRefs: ['cases/test.fountain:12'],
    };

    expect(isCreativeEntityRef(entityRef)).toBe(true);
    expect(
      isCreativeEntity({
        id: 'char_xiaoju',
        kind: 'character',
        canonicalName: '小橘',
        aliases: ['Xiaoju'],
        status: 'confirmed',
      }),
    ).toBe(true);
    expect(isCreativeEntityCandidate(candidate)).toBe(true);
    expect(isCreativeEntityCandidate({ ...candidate, provenance: [{ providerId: 'story' }] })).toBe(
      false,
    );
    expect(isCreativeEntityCandidateFile({ version: 1, candidates: [candidate] })).toBe(true);
    expect(
      isProjectCreativeEntityFile({
        version: 1,
        kind: 'location',
        entities: [
          {
            id: 'location-school',
            kind: 'location',
            canonicalName: '学校',
            aliases: [],
            status: 'confirmed',
          },
        ],
      }),
    ).toBe(true);
    expect(
      isProjectCreativeEntityFile({
        version: 1,
        kind: 'location',
        entities: [
          {
            id: 'char_wrong',
            kind: 'character',
            canonicalName: '小橘',
            aliases: [],
            status: 'confirmed',
          },
        ],
      }),
    ).toBe(false);
  });

  it('validates entity change events and operation result metadata', () => {
    const changedRef = {
      kind: 'entity',
      id: 'char_xiaoju',
      entityRef: { entityId: 'char_xiaoju', entityKind: 'character' },
      factRef: 'characters.json',
    };

    expect(
      isCreativeEntityChangeEvent({
        projectRoot: '${workspaceFolder}',
        reason: 'rename',
        changedRefs: [changedRef],
        generation: 2,
        freshness: 'fresh',
        updatedAt: '2026-05-18T00:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isCreativeEntityOperationResult({
        ok: true,
        action: 'rename',
        projectRoot: '${workspaceFolder}',
        affectedEntityRefs: [{ entityId: 'char_xiaoju', entityKind: 'character' }],
        changedRefs: [changedRef],
        generation: 2,
        freshness: 'fresh',
        updatedAt: '2026-05-18T00:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isCreativeEntityProviderStatus({
        providerId: 'fountain-content',
        sourceKind: 'story',
        available: false,
        freshness: 'stale',
        error: 'Story extension unavailable',
      }),
    ).toBe(true);
    expect(
      isCreativeEntityChangeEvent({
        projectRoot: '${workspaceFolder}',
        reason: 'rewrite-script',
        changedRefs: [changedRef],
        generation: 2,
        freshness: 'fresh',
        updatedAt: '2026-05-18T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('validates binding, draft, and requirement file shapes', () => {
    expect(
      isEntityAssetBindingFile({
        version: 1,
        bindings: [
          {
            id: 'binding-1',
            entityId: 'char_linxia',
            entityKind: 'character',
            assetRef: 'project://assets/linxia',
            role: 'puppet-bone',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: '2026-05-10T00:00:00.000Z',
          },
        ],
      }),
    ).toBe(true);
    expect(isEntityAssetBinding({ id: 'missing-fields' })).toBe(false);
    expect(
      isVisualIdentityDraftFile({
        version: 1,
        drafts: [
          {
            id: 'draft-1',
            characterId: 'char_linxia',
            source: 'agent',
            prompt: 'portrait',
            generatedAssetIds: ['gen-1'],
            status: 'drafting',
          },
        ],
      }),
    ).toBe(true);
    expect(
      isEntityAssetRequirementFile({
        version: 1,
        requirements: [
          {
            id: 'req-1',
            entityId: 'char_linxia',
            entityKind: 'character',
            source: 'live',
            sourceRef: 'live://session/current',
            requiredKinds: ['live2d', 'live3d'],
            status: 'missing',
          },
        ],
      }),
    ).toBe(true);
  });

  it('supports well-known and custom visual fact keys', () => {
    const custom: VisualFactKey = 'tattoo_style';

    expect(WELL_KNOWN_VISUAL_FACT_KEYS).toEqual(
      expect.arrayContaining(['hair', 'eye_color', 'skin_tone', 'height', 'scar']),
    );
    expect(custom).toBe('tattoo_style');
  });

  it('applies backward-compatible defaults for old candidates and bindings', () => {
    const oldCandidate = {
      id: 'candidate:story:character:xiaoju',
      kind: 'character',
      name: '小橘',
      status: 'open',
      provenance: [
        {
          providerId: 'fountain-content',
          sourceKind: 'story',
        },
      ],
      sourceRefs: [],
    };
    const oldBinding = {
      id: 'binding-1',
      entityId: 'char_linxia',
      entityKind: 'character',
      assetRef: 'project://assets/linxia',
      role: 'portrait',
      status: 'confirmed',
      source: 'user',
      updatedAt: '2026-05-10T00:00:00.000Z',
    };

    expect(isCreativeEntityCandidate(oldCandidate)).toBe(true);
    expect(isCreativeEntityCandidateFile({ version: 1, candidates: [oldCandidate] })).toBe(true);
    expect(isEntityAssetBinding(oldBinding)).toBe(true);
    expect(isEntityAssetBindingFile({ version: 1, bindings: [oldBinding] })).toBe(true);

    if (!isCreativeEntityCandidate(oldCandidate) || !isEntityAssetBinding(oldBinding)) {
      throw new Error('Fixture should pass backward-compatible guards.');
    }

    expect(withCreativeEntityCandidateDefaults(oldCandidate).identityBasis).toBe('user-named');
    expect(
      withCreativeEntityCandidateFileDefaults({ version: 1, candidates: [oldCandidate] })
        .candidates[0]?.identityBasis,
    ).toBe('user-named');
    expect(withEntityAssetBindingDefaults(oldBinding).availability).toBe('active');
    expect(
      withEntityAssetBindingFileDefaults({ version: 1, bindings: [oldBinding] }).bindings[0]
        ?.availability,
    ).toBe('active');
  });
});
