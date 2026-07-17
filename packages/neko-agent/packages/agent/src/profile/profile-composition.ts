import type { AgentCapabilityDiagnostic } from '@neko-agent/types';
import type {
  ArtifactProfileDescriptor,
  IArtifactProfileRegistry,
  IProviderExpressionProfileRegistry,
  ProviderExpressionProfileDescriptor,
  Skill,
  SkillProfileReference,
} from '@neko/shared';
import { collectSkillProfileReferences } from '@neko/shared';

export interface AgentProfileCompositionInput {
  readonly skill?: Pick<Skill, 'name' | 'profileReferences' | 'mediaWorkflow'>;
  readonly artifactProfileIds?: readonly string[];
  readonly providerExpressionProfileIds?: readonly string[];
  readonly artifactProfileRegistry?: Pick<IArtifactProfileRegistry, 'get'>;
  readonly providerExpressionProfileRegistry?: Pick<IProviderExpressionProfileRegistry, 'get'>;
}

export interface AgentProfileCompositionResult {
  readonly skillProfileReferences: readonly SkillProfileReference[];
  readonly artifactProfiles: readonly ArtifactProfileDescriptor[];
  readonly providerExpressionProfiles: readonly ProviderExpressionProfileDescriptor[];
  readonly diagnostics: readonly AgentCapabilityDiagnostic[];
}

export function composeAgentProfiles(
  input: AgentProfileCompositionInput,
): AgentProfileCompositionResult {
  const diagnostics: AgentCapabilityDiagnostic[] = [];
  const skillProfileReferences = input.skill ? collectSkillProfileReferences(input.skill) : [];
  const artifactProfileIds = new Set(input.artifactProfileIds ?? []);
  const providerExpressionProfileIds = new Set(input.providerExpressionProfileIds ?? []);

  for (const reference of skillProfileReferences) {
    if (reference.kind === 'artifact') {
      artifactProfileIds.add(reference.profileId);
    } else if (reference.kind === 'provider-expression') {
      providerExpressionProfileIds.add(reference.profileId);
    }
  }

  const artifactProfiles = Array.from(artifactProfileIds)
    .map((profileId) =>
      resolveArtifactProfile(profileId, input.artifactProfileRegistry, diagnostics),
    )
    .filter((profile): profile is ArtifactProfileDescriptor => profile !== undefined);
  const providerExpressionProfiles = Array.from(providerExpressionProfileIds)
    .map((profileId) =>
      resolveProviderExpressionProfile(
        profileId,
        input.providerExpressionProfileRegistry,
        diagnostics,
      ),
    )
    .filter((profile): profile is ProviderExpressionProfileDescriptor => profile !== undefined);

  return {
    skillProfileReferences,
    artifactProfiles,
    providerExpressionProfiles,
    diagnostics,
  };
}

function resolveArtifactProfile(
  profileId: string,
  registry: Pick<IArtifactProfileRegistry, 'get'> | undefined,
  diagnostics: AgentCapabilityDiagnostic[],
): ArtifactProfileDescriptor | undefined {
  const profile = registry?.get(profileId);
  if (!profile) {
    diagnostics.push(createMissingProfileDiagnostic('artifact', profileId));
  }
  return profile;
}

function resolveProviderExpressionProfile(
  profileId: string,
  registry: Pick<IProviderExpressionProfileRegistry, 'get'> | undefined,
  diagnostics: AgentCapabilityDiagnostic[],
): ProviderExpressionProfileDescriptor | undefined {
  const profile = registry?.get(profileId);
  if (!profile) {
    diagnostics.push(createMissingProfileDiagnostic('provider-expression', profileId));
  }
  return profile;
}

function createMissingProfileDiagnostic(
  kind: 'artifact' | 'provider-expression',
  profileId: string,
): AgentCapabilityDiagnostic {
  return {
    phase: 'injection',
    code: `agent.profile.${kind}.missing`,
    reason: 'missing-profile-descriptor',
    message: `Referenced ${kind} profile "${profileId}" is not registered.`,
    metadata: {
      profileId,
      kind,
    },
  };
}
