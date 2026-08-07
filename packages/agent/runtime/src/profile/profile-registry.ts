import type {
  AgentProfileDiagnostic,
  AgentProfileFilter,
  AgentProfileIdentity,
  AgentProfileRegistrationResult,
  AgentProfileSource,
  AgentProfileValidationResult,
  IAgentProfileRegistry,
  ProviderExpressionProfileDescriptor,
} from '@neko/agent-contracts';
import type { ArtifactProfileDescriptor } from '@neko/agent-contracts';
import { validateAgentProfileIdentity } from '@neko/agent-contracts';

export type AgentProfileDescriptor =
  ArtifactProfileDescriptor | ProviderExpressionProfileDescriptor;

export interface AgentProfileRegistryOptions<
  TProfile extends AgentProfileIdentity = AgentProfileIdentity,
> {
  readonly kind: TProfile['kind'];
  readonly validate?: (profile: TProfile) => AgentProfileValidationResult;
}

interface AgentProfileRegistryEntry<TProfile extends AgentProfileIdentity> {
  readonly profile: TProfile;
  readonly order: number;
}

const SOURCE_LAYER_ORDER: readonly AgentProfileSource[] = [
  'builtin',
  'package',
  'personal',
  'project',
  'skill-local',
];

export class AgentProfileRegistry<
  TProfile extends AgentProfileIdentity,
> implements IAgentProfileRegistry<TProfile> {
  private readonly entriesByProfileKey = new Map<string, AgentProfileRegistryEntry<TProfile>[]>();
  private readonly diagnostics: AgentProfileDiagnostic[] = [];
  private nextOrder = 0;

  constructor(private readonly options: AgentProfileRegistryOptions<TProfile>) {}

  register(profile: TProfile): AgentProfileRegistrationResult {
    const diagnostics = this.validateProfile(profile);
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      this.diagnostics.push(...diagnostics);
      return { ok: false, diagnostics };
    }

    const key = profile.profileId;
    const entries = this.entriesByProfileKey.get(key) ?? [];
    const duplicateDiagnostic = this.createDuplicateDiagnostic(profile, entries);
    if (duplicateDiagnostic) {
      diagnostics.push(duplicateDiagnostic);
      this.diagnostics.push(duplicateDiagnostic);
    }

    this.entriesByProfileKey.set(key, [...entries, { profile, order: this.nextOrder++ }]);

    return {
      ok: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
      diagnostics,
    };
  }

  unregister(profileId: string, source?: AgentProfileSource): void {
    const entries = this.entriesByProfileKey.get(profileId);
    if (!entries) return;
    const remaining =
      source === undefined ? [] : entries.filter((entry) => entry.profile.source !== source);
    if (remaining.length === 0) {
      this.entriesByProfileKey.delete(profileId);
    } else {
      this.entriesByProfileKey.set(profileId, remaining);
    }
  }

  get(profileId: string): TProfile | undefined {
    return this.resolveEntries(this.entriesByProfileKey.get(profileId));
  }

  list(filter: AgentProfileFilter<TProfile['kind']> = {}): readonly TProfile[] {
    return Array.from(this.entriesByProfileKey.values())
      .map((entries) => this.resolveEntries(entries))
      .filter((profile): profile is TProfile => profile !== undefined)
      .filter((profile) => matchesProfileFilter(profile, filter))
      .sort(compareProfiles);
  }

  getDiagnostics(): readonly AgentProfileDiagnostic[] {
    return [...this.diagnostics];
  }

  private validateProfile(profile: TProfile): AgentProfileDiagnostic[] {
    return [
      ...validateAgentProfileIdentity(profile, {
        expectedKind: this.options.kind,
      }).diagnostics,
      ...(this.options.validate?.(profile).diagnostics ?? []),
    ];
  }

  private createDuplicateDiagnostic(
    profile: TProfile,
    entries: readonly AgentProfileRegistryEntry<TProfile>[],
  ): AgentProfileDiagnostic | null {
    if (entries.length === 0) return null;
    if (canProfileOverrideExisting(profile, entries)) {
      return {
        severity: 'info',
        code: 'duplicate-profile-id',
        profileId: profile.profileId,
        kind: profile.kind,
        source: profile.source,
        message: 'Agent profile registration explicitly overrides an existing source layer.',
        details: {
          overrideSources: profile.override?.sources ?? [],
        },
      };
    }
    return {
      severity: 'warning',
      code: 'duplicate-profile-id',
      profileId: profile.profileId,
      kind: profile.kind,
      source: profile.source,
      message:
        'Agent profile id is already registered for this kind; source-layer resolution is diagnostic-visible.',
      details: {
        existingSources: entries.map((entry) => entry.profile.source),
        conflictingSource: profile.source,
      },
    };
  }

  private resolveEntries(
    entries: readonly AgentProfileRegistryEntry<TProfile>[] | undefined,
  ): TProfile | undefined {
    if (!entries || entries.length === 0) return undefined;
    return [...entries].sort(compareRegistryEntries).at(-1)?.profile;
  }
}

export class ArtifactProfileRegistry extends AgentProfileRegistry<ArtifactProfileDescriptor> {
  constructor() {
    super({ kind: 'artifact' });
  }
}

export class ProviderExpressionProfileRegistry extends AgentProfileRegistry<ProviderExpressionProfileDescriptor> {
  constructor() {
    super({ kind: 'provider-expression' });
  }
}

export function createArtifactProfileRegistry(
  profiles: readonly ArtifactProfileDescriptor[] = [],
): ArtifactProfileRegistry {
  const registry = new ArtifactProfileRegistry();
  for (const profile of profiles) {
    registry.register(profile);
  }
  return registry;
}

export function createProviderExpressionProfileRegistry(
  profiles: readonly ProviderExpressionProfileDescriptor[] = [],
): ProviderExpressionProfileRegistry {
  const registry = new ProviderExpressionProfileRegistry();
  for (const profile of profiles) {
    registry.register(profile);
  }
  return registry;
}

function matchesProfileFilter<TProfile extends AgentProfileIdentity>(
  profile: TProfile,
  filter: AgentProfileFilter<TProfile['kind']>,
): boolean {
  if (filter.profileId && profile.profileId !== filter.profileId) return false;
  if (filter.kind && profile.kind !== filter.kind) return false;
  if (filter.source && profile.source !== filter.source) return false;
  if (!filter.includeSkillLocal && profile.source === 'skill-local') return false;
  return true;
}

function canProfileOverrideExisting<TProfile extends AgentProfileIdentity>(
  profile: TProfile,
  entries: readonly AgentProfileRegistryEntry<TProfile>[],
): boolean {
  return entries.some((entry) => doesProfileOverride(profile, entry.profile));
}

function doesProfileOverride<TProfile extends AgentProfileIdentity>(
  profile: TProfile,
  existing: TProfile,
): boolean {
  const override = profile.override;
  if (!override) return false;
  if (override.sources && !override.sources.includes(existing.source)) return false;
  return profile.profileId === existing.profileId && profile.kind === existing.kind;
}

function compareRegistryEntries<TProfile extends AgentProfileIdentity>(
  left: AgentProfileRegistryEntry<TProfile>,
  right: AgentProfileRegistryEntry<TProfile>,
): number {
  return (
    SOURCE_LAYER_ORDER.indexOf(left.profile.source) -
      SOURCE_LAYER_ORDER.indexOf(right.profile.source) || left.order - right.order
  );
}

function compareProfiles<TProfile extends AgentProfileIdentity>(
  left: TProfile,
  right: TProfile,
): number {
  return (
    left.kind.localeCompare(right.kind) ||
    left.profileId.localeCompare(right.profileId) ||
    SOURCE_LAYER_ORDER.indexOf(left.source) - SOURCE_LAYER_ORDER.indexOf(right.source)
  );
}
