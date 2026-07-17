import { describe, expect, it } from 'vitest';
import type {
  ArtifactProfileDescriptor,
  ProviderExpressionProfileDescriptor,
  Skill,
} from '@neko/shared';
import { ArtifactProfileRegistry, ProviderExpressionProfileRegistry } from '../profile-registry';
import { composeAgentProfiles } from '../profile-composition';

describe('composeAgentProfiles', () => {
  it('resolves Skill profile references through registries with visible diagnostics', () => {
    const artifactProfileRegistry = new ArtifactProfileRegistry();
    const providerExpressionProfileRegistry = new ProviderExpressionProfileRegistry();
    const artifactProfile = makeArtifactProfile();
    const providerExpressionProfile = makeProviderExpressionProfile();
    artifactProfileRegistry.register(artifactProfile);
    providerExpressionProfileRegistry.register(providerExpressionProfile);
    const skill: Pick<Skill, 'name' | 'profileReferences' | 'mediaWorkflow'> = {
      name: 'studio-skill',
      profileReferences: [
        {
          profileId: 'provider-expression:flux',
          kind: 'provider-expression',
          relationship: 'prefers',
        },
      ],
      mediaWorkflow: {
        artifactProfiles: ['studio.shot-review', 'studio.missing-table'],
      },
    };

    const result = composeAgentProfiles({
      skill,
      artifactProfileRegistry,
      providerExpressionProfileRegistry,
    });

    expect(result.artifactProfiles).toEqual([artifactProfile]);
    expect(result.providerExpressionProfiles).toEqual([providerExpressionProfile]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'agent.profile.artifact.missing',
        reason: 'missing-profile-descriptor',
      }),
    ]);
  });
});

function makeArtifactProfile(): ArtifactProfileDescriptor {
  return {
    profileId: 'studio.shot-review',
    kind: 'artifact',
    protocol: 'GenericTable',
    version: 1,
    source: 'package',
    columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
  };
}

function makeProviderExpressionProfile(): ProviderExpressionProfileDescriptor {
  return {
    profileId: 'provider-expression:flux',
    kind: 'provider-expression',
    source: 'package',
    providerId: 'flux',
    displayName: 'Flux',
    version: '1.0.0',
    sourceLayer: 'builtin',
    capabilities: ['image.generate'],
    syntaxProfile: { notes: [] },
    conceptCoverage: { entries: [] },
    trainingProfile: { styleAffinities: { photorealistic: 3 }, antiBiasStrategies: [] },
  };
}
