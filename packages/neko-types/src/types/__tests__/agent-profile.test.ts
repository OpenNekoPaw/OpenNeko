import { describe, expect, it } from 'vitest';
import {
  collectSkillProfileReferences,
  toAgentProfileCatalogPackage,
  toProviderExpressionProfile,
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
  it('validates Agent profile identity, kind, source, version, and duplicates', () => {
    const valid: AgentProfileIdentity<'artifact', string> = {
      profileId: 'studio.artifact.review',
      kind: 'artifact',
      version: '1.0.0',
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
          version: '',
          source: 'shared',
        } as unknown as AgentProfileIdentity,
      ]).diagnostics.map((diagnostic) => diagnostic.code),
    ).toEqual(
      expect.arrayContaining([
        'invalid-profile-id',
        'unsupported-profile-version',
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
      version: 1,
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
      version: 1,
      source: 'skill-local',
      columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
    };
    const table: GenericTable = {
      schemaVersion: 1,
      kind: 'generic-table',
      tableId: 'temp-table',
      profile: 'skill.temp-table',
      profileVersion: 1,
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

  it('normalizes ProviderCard as a provider/model expression profile', () => {
    const card: ProviderCard = {
      providerId: 'flux',
      modelId: 'flux-pro',
      displayName: 'Flux Pro',
      version: '1.0.0',
      capabilities: ['image.generate'],
      sourceLayer: 'builtin',
      syntaxProfile: { supportsNegativePrompt: false, notes: [] },
      conceptCoverage: { entries: [] },
      trainingProfile: { styleAffinities: { photorealistic: 3 }, antiBiasStrategies: [] },
    };

    const profile = toProviderExpressionProfile(card);

    expect(profile).toMatchObject({
      profileId: 'provider-expression:flux:flux-pro',
      kind: 'provider-expression',
      source: 'builtin',
    });
    expect(validateProviderExpressionProfileDescriptor(profile).ok).toBe(true);
    expect(
      validateProviderExpressionProfileDescriptor({
        ...profile,
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
            versionRange: '^1.0.0',
          },
        ],
        mediaWorkflow: { artifactProfiles: ['studio.shot-review'] },
      }),
    ).toEqual([
      {
        profileId: 'provider-expression:studio',
        kind: 'provider-expression',
        relationship: 'prefers',
        versionRange: '^1.0.0',
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
              version: 1,
              displayName: 'Studio Storyboard',
            },
            {
              profileId: 'provider-expression:studio',
              kind: 'provider-expression',
              version: '1.0.0',
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
          version: 1,
          displayName: 'Studio Storyboard',
        },
        {
          profileId: 'provider-expression:studio',
          kind: 'provider-expression',
          version: '1.0.0',
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
