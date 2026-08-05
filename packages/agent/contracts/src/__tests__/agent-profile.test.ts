import { describe, expect, it } from 'vitest';
import {
  collectSkillProfileReferences,
  toAgentProfileCatalogPackage,
  validateAgentProfileDescriptorSet,
  validateArtifactProfileDescriptor,
  validateGenericTable,
  validateProviderExpressionProfileDescriptor,
  type AgentProfileIdentity,
  type ArtifactProfileDescriptor,
  type GenericTable,
  type ProviderCard,
} from '..';

describe('Agent profile shared contracts', () => {
  it('validates Agent profile identity, kind, source, and duplicates', () => {
    const valid: AgentProfileIdentity<'artifact'> = {
      profileId: 'studio.artifact.review',
      kind: 'artifact',
      source: 'package',
    };

    expect(validateAgentProfileDescriptorSet([valid]).ok).toBe(true);
    expect(
      validateAgentProfileDescriptorSet([valid, { ...valid, source: 'project' }]).diagnostics,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-profile-id', severity: 'error' }),
      ]),
    );
    expect(
      validateAgentProfileDescriptorSet([
        {
          profileId: '',
          kind: 'workflow',
          source: 'shared',
        } as unknown as AgentProfileIdentity,
      ]).diagnostics.map((diagnostic) => diagnostic.code),
    ).toEqual(
      expect.arrayContaining([
        'invalid-profile-id',
        'invalid-profile-kind',
        'invalid-profile-source',
      ]),
    );
  });

  it('validates Artifact Profile durable descriptor shape', () => {
    const profile: ArtifactProfileDescriptor = {
      profileId: 'studio.shot-review',
      kind: 'artifact',
      protocol: 'GenericTable',
      source: 'package',
      columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
      schemaRefs: [{ schemaId: 'studio.shot-review.v1', required: true }],
      resourceConstraints: [{ constraintId: 'source-image', mediaTypes: ['image'] }],
      operationRequirements: [{ operationId: 'review', validatorId: 'shot-review' }],
    };

    expect(validateArtifactProfileDescriptor(profile)).toEqual({ ok: true, diagnostics: [] });
    expect(
      validateArtifactProfileDescriptor({
        ...profile,
        columns: [{ columnId: 'shotId', cellType: 'spreadsheet' }],
      }).diagnostics,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'malformed-profile-descriptor' })]),
    );
  });

  it('rejects skill-local Artifact Profiles for persisted artifacts', () => {
    const profile: ArtifactProfileDescriptor = {
      profileId: 'skill.temp-table',
      kind: 'artifact',
      protocol: 'GenericTable',
      source: 'skill-local',
      columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
    };
    const table: GenericTable = {
      kind: 'generic-table',
      tableId: 'temp-table',
      profile: 'skill.temp-table',
      title: 'Temporary table',
      columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
      rows: [{ rowId: 'row-1', cells: { shotId: { type: 'string', value: 'shot-1' } } }],
    };

    const result = validateGenericTable(table, { profiles: [profile], persisted: true });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'skill-local-profile-persisted', severity: 'error' }),
      ]),
    );
  });

  it('validates the canonical ProviderCard profile without compatibility conversion', () => {
    const card: ProviderCard = {
      profileId: 'provider-expression:flux:flux-pro',
      kind: 'provider-expression',
      source: 'builtin',
      providerId: 'flux',
      modelId: 'flux-pro',
      displayName: 'Flux Pro',
      capabilities: ['image.generate'],
      sourceLayer: 'builtin',
      syntaxProfile: { supportsNegativePrompt: false, notes: [] },
      conceptCoverage: { entries: [] },
      trainingProfile: { styleAffinities: { photorealistic: 3 }, antiBiasStrategies: [] },
    };

    expect(card).toMatchObject({
      profileId: 'provider-expression:flux:flux-pro',
      kind: 'provider-expression',
      source: 'builtin',
    });
    expect(validateProviderExpressionProfileDescriptor(card).ok).toBe(true);
    expect(
      validateProviderExpressionProfileDescriptor({
        ...card,
        profileId: undefined,
      }).ok,
    ).toBe(false);
    expect(
      validateProviderExpressionProfileDescriptor({
        ...card,
        apiKey: 'secret',
      }).diagnostics,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'provider-expression-secrets-forbidden' }),
      ]),
    );
  });

  it('collects supported Skill profile references and mediaWorkflow shorthand', () => {
    expect(
      collectSkillProfileReferences({
        profileReferences: [
          {
            profileId: 'provider-expression:studio',
            kind: 'provider-expression',
            relationship: 'prefers',
          },
        ],
        mediaWorkflow: { artifactProfiles: ['studio.shot-review'] },
      }),
    ).toEqual([
      {
        profileId: 'provider-expression:studio',
        kind: 'provider-expression',
        relationship: 'prefers',
      },
      {
        profileId: 'studio.shot-review',
        kind: 'artifact',
        relationship: 'produces',
      },
    ]);
  });

  it('projects profile-only packages into a non-runnable profile catalog entry', () => {
    const entry = toAgentProfileCatalogPackage({
      id: '@studio/storyboard-profiles',
      name: 'storyboard-profiles',
      version: '1.0.0',
      type: 'profile',
      typeMetadata: {
        type: 'profile',
        data: {
          profileKinds: ['artifact', 'provider-expression'],
          profiles: [
            {
              profileId: 'studio.storyboard.v1',
              kind: 'artifact',
              displayName: 'Studio Storyboard',
            },
            {
              profileId: 'provider-expression:studio',
              kind: 'provider-expression',
            },
          ],
        },
      },
    });

    expect(entry).toEqual({
      packageId: '@studio/storyboard-profiles',
      name: 'storyboard-profiles',
      version: '1.0.0',
      profileKinds: ['artifact', 'provider-expression'],
      profiles: [
        {
          profileId: 'studio.storyboard.v1',
          kind: 'artifact',
          displayName: 'Studio Storyboard',
        },
        {
          profileId: 'provider-expression:studio',
          kind: 'provider-expression',
        },
      ],
      runnable: false,
    });

    expect(
      toAgentProfileCatalogPackage({
        id: '@studio/skill',
        name: 'skill',
        version: '1.0.0',
        type: 'skill',
      }),
    ).toBeUndefined();
  });
});
