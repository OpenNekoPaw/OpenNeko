export const AGENT_PROFILE_KINDS = ['artifact', 'provider-expression'] as const;

export const AGENT_PROFILE_SOURCES = [
  'builtin',
  'package',
  'market',
  'project',
  'personal',
  'skill-local',
] as const;

export const PERSISTABLE_AGENT_PROFILE_SOURCES = [
  'builtin',
  'package',
  'market',
  'project',
  'personal',
] as const;

export const AGENT_PROFILE_RELATIONSHIPS = ['consumes', 'produces', 'requires', 'prefers'] as const;

export const AGENT_PROFILE_DIAGNOSTIC_SEVERITIES = ['error', 'warning', 'info'] as const;

export type AgentProfileKind = (typeof AGENT_PROFILE_KINDS)[number];

export type AgentProfileSource = (typeof AGENT_PROFILE_SOURCES)[number];

export type PersistableAgentProfileSource = (typeof PERSISTABLE_AGENT_PROFILE_SOURCES)[number];

export type AgentProfileRelationship = (typeof AGENT_PROFILE_RELATIONSHIPS)[number];

export type AgentProfileDiagnosticSeverity = (typeof AGENT_PROFILE_DIAGNOSTIC_SEVERITIES)[number];

export type AgentProfileVersion = string | number;

export type AgentProfilePathSegment = string | number;

export type AgentProfileDiagnosticCode =
  | 'invalid-profile-root'
  | 'missing-profile-id'
  | 'invalid-profile-id'
  | 'missing-profile-version'
  | 'unsupported-profile-version'
  | 'invalid-profile-kind'
  | 'invalid-profile-source'
  | 'malformed-profile-descriptor'
  | 'duplicate-profile-id'
  | 'missing-profile-descriptor'
  | 'incompatible-profile-kind'
  | 'skill-local-profile-persisted'
  | 'profile-trust-failed'
  | 'profile-host-not-supported'
  | 'provider-expression-secrets-forbidden';

export interface AgentProfileIdentity<
  TKind extends AgentProfileKind = AgentProfileKind,
  TVersion extends AgentProfileVersion = AgentProfileVersion,
> {
  readonly profileId: string;
  readonly version: TVersion;
  readonly kind: TKind;
  readonly source: AgentProfileSource;
  readonly sourceRef?: string;
  readonly packageId?: string;
  readonly publisherId?: string;
  readonly override?: AgentProfileOverridePolicy<TVersion>;
}

export interface AgentProfileOverridePolicy<
  TVersion extends AgentProfileVersion = AgentProfileVersion,
> {
  readonly sources?: readonly AgentProfileSource[];
  readonly version?: TVersion;
  readonly reason?: string;
}

export interface AgentProfileDiagnostic {
  readonly severity: AgentProfileDiagnosticSeverity;
  readonly code: AgentProfileDiagnosticCode;
  readonly message: string;
  readonly path?: readonly AgentProfilePathSegment[];
  readonly profileId?: string;
  readonly kind?: AgentProfileKind;
  readonly source?: AgentProfileSource;
  readonly expected?: string;
  readonly actual?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AgentProfileValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly AgentProfileDiagnostic[];
}

export interface AgentProfileFilter<
  TKind extends AgentProfileKind = AgentProfileKind,
  TVersion extends AgentProfileVersion = AgentProfileVersion,
> {
  readonly profileId?: string;
  readonly kind?: TKind;
  readonly version?: TVersion;
  readonly source?: AgentProfileSource;
  readonly includeSkillLocal?: boolean;
}

export interface AgentProfileRegistrationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly AgentProfileDiagnostic[];
}

export interface IAgentProfileRegistry<
  TProfile extends AgentProfileIdentity = AgentProfileIdentity,
> {
  register(profile: TProfile): AgentProfileRegistrationResult;
  unregister(profileId: string, source?: AgentProfileSource, version?: TProfile['version']): void;
  get(profileId: string, version?: TProfile['version']): TProfile | undefined;
  list(filter?: AgentProfileFilter<TProfile['kind'], TProfile['version']>): readonly TProfile[];
  getDiagnostics?(): readonly AgentProfileDiagnostic[];
}

export interface AgentProfileCatalogPackageProfile {
  readonly profileId: string;
  readonly kind: AgentProfileKind;
  readonly version: AgentProfileVersion;
  readonly displayName?: string;
}

export interface AgentProfileCatalogPackage {
  readonly packageId: string;
  readonly name: string;
  readonly version: string;
  readonly profileKinds: readonly AgentProfileKind[];
  readonly profiles: readonly AgentProfileCatalogPackageProfile[];
  readonly runnable: false;
}

export interface AgentProfilePackageCatalogProjectable {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly type: string;
  readonly typeMetadata?: {
    readonly type: string;
    readonly data?: {
      readonly profileKinds?: readonly unknown[];
      readonly profiles?: readonly unknown[];
    };
  };
}

export interface AgentProfileIdentityValidationOptions {
  readonly expectedKind?: AgentProfileKind;
  readonly supportedVersions?: readonly AgentProfileVersion[];
  readonly requirePersistableSource?: boolean;
  readonly path?: readonly AgentProfilePathSegment[];
}

export interface AgentProfileSetValidationOptions extends AgentProfileIdentityValidationOptions {
  readonly allowDuplicateProfileIds?: boolean;
}

const AGENT_PROFILE_ID_RE = /^[a-z0-9][a-z0-9._:-]{0,127}$/;

export function createAgentProfileDiagnostic(
  diagnostic: AgentProfileDiagnostic,
): AgentProfileDiagnostic {
  return diagnostic;
}

export function isAgentProfileKind(value: unknown): value is AgentProfileKind {
  return typeof value === 'string' && AGENT_PROFILE_KINDS.includes(value as AgentProfileKind);
}

export function isAgentProfileSource(value: unknown): value is AgentProfileSource {
  return typeof value === 'string' && AGENT_PROFILE_SOURCES.includes(value as AgentProfileSource);
}

export function isAgentProfileRelationship(value: unknown): value is AgentProfileRelationship {
  return (
    typeof value === 'string' &&
    AGENT_PROFILE_RELATIONSHIPS.includes(value as AgentProfileRelationship)
  );
}

export function isPersistableAgentProfileSource(
  value: unknown,
): value is PersistableAgentProfileSource {
  return (
    typeof value === 'string' &&
    PERSISTABLE_AGENT_PROFILE_SOURCES.includes(value as PersistableAgentProfileSource)
  );
}

export function isValidAgentProfileId(value: unknown): value is string {
  return typeof value === 'string' && AGENT_PROFILE_ID_RE.test(value);
}

export function validateAgentProfileIdentity(
  descriptor: unknown,
  options: AgentProfileIdentityValidationOptions = {},
): AgentProfileValidationResult {
  const diagnostics: AgentProfileDiagnostic[] = [];
  const path = options.path ?? [];

  if (!isRecord(descriptor)) {
    diagnostics.push({
      severity: 'error',
      code: 'invalid-profile-root',
      path,
      message: 'Agent profile descriptor must be an object.',
      expected: 'object',
      actual: descriptor,
    });
    return toAgentProfileValidationResult(diagnostics);
  }

  const profileId = descriptor['profileId'];
  if (profileId === undefined) {
    diagnostics.push({
      severity: 'error',
      code: 'missing-profile-id',
      path: [...path, 'profileId'],
      message: 'Agent profile descriptor must declare profileId.',
    });
  } else if (!isValidAgentProfileId(profileId)) {
    diagnostics.push({
      severity: 'error',
      code: 'invalid-profile-id',
      path: [...path, 'profileId'],
      message:
        'Agent profileId must start with an alphanumeric character and contain only letters, numbers, dot, underscore, colon, or hyphen.',
      expected: AGENT_PROFILE_ID_RE.source,
      actual: profileId,
    });
  }

  const version = descriptor['version'];
  if (version === undefined) {
    diagnostics.push({
      severity: 'error',
      code: 'missing-profile-version',
      path: [...path, 'version'],
      message: 'Agent profile descriptor must declare version.',
    });
  } else if (!isProfileVersion(version)) {
    diagnostics.push({
      severity: 'error',
      code: 'unsupported-profile-version',
      path: [...path, 'version'],
      message: 'Agent profile version must be a non-empty string or integer.',
      expected: 'non-empty string or integer',
      actual: version,
    });
  } else if (
    options.supportedVersions &&
    !options.supportedVersions.some((supported) => supported === version)
  ) {
    diagnostics.push({
      severity: 'error',
      code: 'unsupported-profile-version',
      path: [...path, 'version'],
      profileId: typeof profileId === 'string' ? profileId : undefined,
      message: 'Agent profile version is not supported by this host.',
      expected: options.supportedVersions.map(String).join(', '),
      actual: version,
    });
  }

  const kind = descriptor['kind'];
  if (!isAgentProfileKind(kind)) {
    diagnostics.push({
      severity: 'error',
      code: 'invalid-profile-kind',
      path: [...path, 'kind'],
      message: 'Agent profile descriptor must declare a supported kind.',
      expected: AGENT_PROFILE_KINDS.join(', '),
      actual: kind,
    });
  } else if (options.expectedKind && kind !== options.expectedKind) {
    diagnostics.push({
      severity: 'error',
      code: 'incompatible-profile-kind',
      path: [...path, 'kind'],
      profileId: typeof profileId === 'string' ? profileId : undefined,
      kind,
      message: 'Agent profile kind does not match the required profile family.',
      expected: options.expectedKind,
      actual: kind,
    });
  }

  const source = descriptor['source'];
  if (!isAgentProfileSource(source)) {
    diagnostics.push({
      severity: 'error',
      code: 'invalid-profile-source',
      path: [...path, 'source'],
      profileId: typeof profileId === 'string' ? profileId : undefined,
      message: 'Agent profile descriptor must declare a supported source.',
      expected: AGENT_PROFILE_SOURCES.join(', '),
      actual: source,
    });
  } else if (options.requirePersistableSource && !isPersistableAgentProfileSource(source)) {
    diagnostics.push({
      severity: 'error',
      code: 'skill-local-profile-persisted',
      path: [...path, 'source'],
      profileId: typeof profileId === 'string' ? profileId : undefined,
      kind: isAgentProfileKind(kind) ? kind : undefined,
      source,
      message: 'skill-local profiles cannot satisfy persisted or shared profile contracts.',
      expected: PERSISTABLE_AGENT_PROFILE_SOURCES.join(', '),
      actual: source,
    });
  }

  return toAgentProfileValidationResult(diagnostics);
}

export function validateAgentProfileDescriptorSet<
  TProfile extends AgentProfileIdentity = AgentProfileIdentity,
>(
  descriptors: readonly TProfile[],
  options: AgentProfileSetValidationOptions = {},
): AgentProfileValidationResult {
  const diagnostics: AgentProfileDiagnostic[] = [];
  const seen = new Map<string, TProfile>();

  descriptors.forEach((descriptor, index) => {
    diagnostics.push(
      ...validateAgentProfileIdentity(descriptor, {
        ...options,
        path: [...(options.path ?? []), index],
      }).diagnostics,
    );

    if (options.allowDuplicateProfileIds) return;
    const key = `${descriptor.kind}\u0000${descriptor.profileId}\u0000${String(descriptor.version)}`;
    const existing = seen.get(key);
    if (existing) {
      diagnostics.push({
        severity: 'error',
        code: 'duplicate-profile-id',
        path: [...(options.path ?? []), index, 'profileId'],
        profileId: descriptor.profileId,
        kind: descriptor.kind,
        source: descriptor.source,
        message: 'Agent profile descriptor duplicates an existing profile id, kind, and version.',
        details: {
          existingSource: existing.source,
          conflictingSource: descriptor.source,
          version: descriptor.version,
        },
      });
      return;
    }
    seen.set(key, descriptor);
  });

  return toAgentProfileValidationResult(diagnostics);
}

export function toAgentProfileCatalogPackage(
  manifest: AgentProfilePackageCatalogProjectable,
): AgentProfileCatalogPackage | undefined {
  if (manifest.type !== 'profile' || manifest.typeMetadata?.type !== 'profile') {
    return undefined;
  }
  const data = manifest.typeMetadata.data;
  if (!data || !Array.isArray(data.profileKinds) || !Array.isArray(data.profiles)) {
    return undefined;
  }

  const profileKinds = data.profileKinds.filter(isAgentProfileKind);
  const profiles = data.profiles
    .map(toAgentProfileCatalogPackageProfile)
    .filter((profile): profile is AgentProfileCatalogPackageProfile => profile !== undefined);

  return {
    packageId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    profileKinds,
    profiles,
    runnable: false,
  };
}

export function toAgentProfileValidationResult(
  diagnostics: readonly AgentProfileDiagnostic[],
): AgentProfileValidationResult {
  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    diagnostics,
  };
}

function toAgentProfileCatalogPackageProfile(
  value: unknown,
): AgentProfileCatalogPackageProfile | undefined {
  if (!isRecord(value)) return undefined;
  const profileId = value['profileId'];
  const kind = value['kind'];
  const version = value['version'];
  if (
    !isValidAgentProfileId(profileId) ||
    !isAgentProfileKind(kind) ||
    !isProfileVersion(version)
  ) {
    return undefined;
  }
  return {
    profileId,
    kind,
    version,
    ...(typeof value['displayName'] === 'string' ? { displayName: value['displayName'] } : {}),
  };
}

function isProfileVersion(value: unknown): value is AgentProfileVersion {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0;
  }
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
