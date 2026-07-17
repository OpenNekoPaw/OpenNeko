import {
  BUILTIN_ARTIFACT_PROFILES,
  ArtifactProfileRegistry,
  ProviderExpressionProfileRegistry,
} from '../../profile';

export interface AgentCapabilityRuntimeRegistries {
  readonly artifactProfileRegistry: ArtifactProfileRegistry;
  readonly providerExpressionProfileRegistry: ProviderExpressionProfileRegistry;
}

/**
 * Create host-neutral runtime registries used by capability discovery.
 *
 * Skills are discovered by Pi Skill Host; these registries cover product profiles only.
 */
export function createAgentCapabilityRuntimeRegistries(): AgentCapabilityRuntimeRegistries {
  const artifactProfileRegistry = new ArtifactProfileRegistry();
  const providerExpressionProfileRegistry = new ProviderExpressionProfileRegistry();

  for (const profile of BUILTIN_ARTIFACT_PROFILES) {
    artifactProfileRegistry.register(profile);
  }
  return {
    artifactProfileRegistry,
    providerExpressionProfileRegistry,
  };
}
