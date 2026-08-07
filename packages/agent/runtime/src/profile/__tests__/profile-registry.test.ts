import { describe, expect, it } from 'vitest';
import type { ProviderExpressionProfileDescriptor } from '@neko/agent-contracts';
import type { ArtifactProfileDescriptor } from '@neko/agent-contracts';
import { ArtifactProfileRegistry, ProviderExpressionProfileRegistry } from '../profile-registry';

describe('Agent profile registries', () => {
  it('records duplicate diagnostics without silently hiding source layers', () => {
    const registry = new ArtifactProfileRegistry();
    registry.register(makeArtifactProfile({ source: 'builtin' }));
    const result = registry.register(makeArtifactProfile({ source: 'package' }));

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-profile-id', severity: 'warning' }),
      ]),
    );
    expect(registry.get('studio.shot-review')).toEqual(
      expect.objectContaining({ source: 'package' }),
    );
    expect(registry.getDiagnostics()).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'duplicate-profile-id' })]),
    );
  });

  it('allows explicit project override and unregisters only the contributing source', () => {
    const registry = new ArtifactProfileRegistry();
    registry.register(makeArtifactProfile({ source: 'builtin' }));
    registry.register(
      makeArtifactProfile({
        source: 'project',
        override: { sources: ['builtin'], reason: 'project-specific review table' },
      }),
    );

    expect(registry.get('studio.shot-review')).toEqual(
      expect.objectContaining({ source: 'project' }),
    );

    registry.register(makeArtifactProfile({ source: 'personal', profileId: 'studio.alt-review' }));
    registry.unregister('studio.shot-review', 'project');

    expect(registry.get('studio.shot-review')).toEqual(
      expect.objectContaining({ source: 'builtin' }),
    );
    expect(registry.get('studio.alt-review')).toEqual(
      expect.objectContaining({ source: 'personal' }),
    );
  });

  it('supports provider expression profiles', () => {
    const providerExpressionRegistry = new ProviderExpressionProfileRegistry();
    const expressionProfile: ProviderExpressionProfileDescriptor = {
      profileId: 'provider-expression:flux',
      kind: 'provider-expression',
      source: 'package',
      providerId: 'flux',
      displayName: 'Flux',
      sourceLayer: 'builtin',
      capabilities: ['image.generate'],
      syntaxProfile: { notes: [] },
      conceptCoverage: { entries: [] },
      trainingProfile: { styleAffinities: { photorealistic: 3 }, antiBiasStrategies: [] },
    };

    expect(providerExpressionRegistry.register(expressionProfile).ok).toBe(true);

    expect(providerExpressionRegistry.get('provider-expression:flux')).toEqual(expressionProfile);
  });
});

function makeArtifactProfile(
  overrides: Partial<ArtifactProfileDescriptor> = {},
): ArtifactProfileDescriptor {
  return {
    profileId: 'studio.shot-review',
    kind: 'artifact',
    protocol: 'GenericTable',
    source: 'package',
    columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
    ...overrides,
  };
}
