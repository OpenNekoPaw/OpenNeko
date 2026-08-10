import type {
  AgentExtensionCatalogItem,
  AgentExtensionDiagnosticCode,
  AgentExtensionStatus,
} from './extension-catalog';

export interface AgentExtensionManagementSessionIdentity {
  readonly windowId: string;
}

export interface AgentManagedSkillItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: 'personal' | 'plugin';
  readonly sourceId: string;
  readonly managementId: string;
  readonly canRemove: boolean;
}

export type AgentExtensionArtifactOperationKind = 'install' | 'update';
export type AgentExtensionArtifactOperationPhase =
  'queued' | 'downloading' | 'verifying' | 'committing' | 'cancelling';
export type AgentExtensionArtifactOperationStatus = 'active' | 'completed' | 'cancelled' | 'failed';

export interface AgentExtensionArtifactOperationSnapshot {
  readonly operationId: string;
  readonly pluginId: string;
  readonly kind: AgentExtensionArtifactOperationKind;
  readonly phase: AgentExtensionArtifactOperationPhase;
  readonly status: AgentExtensionArtifactOperationStatus;
  readonly transferredBytes: number;
  readonly totalBytes: number;
  readonly canCancel: boolean;
  readonly diagnosticCode: '' | 'cancelled' | 'operation-failed';
}

export interface AgentExtensionManagementProjection {
  readonly identity: AgentExtensionManagementSessionIdentity;
  readonly operations: readonly AgentExtensionArtifactOperationSnapshot[];
  readonly skills: readonly AgentManagedSkillItem[];
  readonly skillDiscovery: {
    readonly diagnostics: readonly {
      readonly code:
        'file_info_failed' | 'list_failed' | 'read_failed' | 'parse_failed' | 'invalid_metadata';
      readonly source: AgentManagedSkillItem['source'];
      readonly count: number;
    }[];
    readonly duplicateCount: number;
  };
  readonly extensions: readonly AgentExtensionCatalogItem[];
  readonly extensionDiscovery: {
    readonly diagnostics: readonly {
      readonly code: AgentExtensionDiagnosticCode;
      readonly count: number;
    }[];
  };
}

export interface AgentExtensionManagementRuntime {
  readonly identity: AgentExtensionManagementSessionIdentity;
  getSnapshot(): Promise<AgentExtensionManagementProjection>;
  installPlugin(pluginId: string): Promise<void>;
  updatePlugin(pluginId: string): Promise<void>;
  cancelPluginOperation(operationId: string): Promise<void>;
  enablePlugin(pluginId: string): Promise<void>;
  disablePlugin(pluginId: string): Promise<void>;
  removePlugin(pluginId: string): Promise<void>;
  refreshMarketplaces(): Promise<void>;
  installPersonalSkill(): Promise<void>;
  removePersonalSkill(managementId: string): Promise<void>;
  dispose(): void;
}

export function parseAgentExtensionManagementProjection(
  value: unknown,
): AgentExtensionManagementProjection {
  const record = requireExactRecord(
    value,
    ['identity', 'operations', 'skills', 'skillDiscovery', 'extensions', 'extensionDiscovery'],
    'Agent Extension Management projection is invalid.',
  );
  if (
    !Array.isArray(record['operations']) ||
    !Array.isArray(record['skills']) ||
    !Array.isArray(record['extensions'])
  ) {
    throw new Error('Agent Extension Management catalog is invalid.');
  }
  return {
    identity: parseAgentExtensionManagementSessionIdentity(record['identity']),
    operations: record['operations'].map(parseArtifactOperation),
    skills: record['skills'].map(parseManagedSkill),
    skillDiscovery: parseSkillDiscovery(record['skillDiscovery']),
    extensions: record['extensions'].map(parseExtension),
    extensionDiscovery: parseExtensionDiscovery(record['extensionDiscovery']),
  };
}

function parseArtifactOperation(value: unknown): AgentExtensionArtifactOperationSnapshot {
  const record = requireExactRecord(
    value,
    [
      'operationId',
      'pluginId',
      'kind',
      'phase',
      'status',
      'transferredBytes',
      'totalBytes',
      'canCancel',
      'diagnosticCode',
    ],
    'Agent Extension Management artifact operation is invalid.',
  );
  const phase = requireOneOf(
    record['phase'],
    ['queued', 'downloading', 'verifying', 'committing', 'cancelling'] as const,
    'Agent Extension Management artifact operation phase is invalid.',
  );
  const status = requireOneOf(
    record['status'],
    ['active', 'completed', 'cancelled', 'failed'] as const,
    'Agent Extension Management artifact operation status is invalid.',
  );
  const transferredBytes = requireNonNegativeInteger(
    record['transferredBytes'],
    'Agent Extension Management artifact operation progress is invalid.',
  );
  const totalBytes = requireNonNegativeInteger(
    record['totalBytes'],
    'Agent Extension Management artifact operation total size is invalid.',
  );
  const canCancel = requireBoolean(
    record['canCancel'],
    'Agent Extension Management artifact operation cancellation is invalid.',
  );
  const diagnosticCode = requireOneOf(
    record['diagnosticCode'],
    ['', 'cancelled', 'operation-failed'] as const,
    'Agent Extension Management artifact operation diagnostic is invalid.',
  );
  if (
    transferredBytes > totalBytes ||
    canCancel !== (status === 'active' && phase !== 'committing' && phase !== 'cancelling') ||
    (['downloading', 'verifying', 'committing'].includes(phase) && totalBytes === 0) ||
    (status === 'active' && diagnosticCode !== '') ||
    (status === 'completed' &&
      (phase !== 'committing' || diagnosticCode !== '' || transferredBytes !== totalBytes)) ||
    (status === 'cancelled' && (phase !== 'cancelling' || diagnosticCode !== 'cancelled')) ||
    (status === 'failed' && diagnosticCode !== 'operation-failed')
  ) {
    throw new Error('Agent Extension Management artifact operation state is inconsistent.');
  }
  return {
    operationId: requireNonEmptyString(
      record['operationId'],
      'Agent Extension Management artifact operation identity is required.',
    ),
    pluginId: requirePluginId(record['pluginId']),
    kind: requireOneOf(
      record['kind'],
      ['install', 'update'] as const,
      'Agent Extension Management artifact operation kind is invalid.',
    ),
    phase,
    status,
    transferredBytes,
    totalBytes,
    canCancel,
    diagnosticCode,
  };
}

export function parseAgentExtensionManagementSessionIdentity(
  value: unknown,
): AgentExtensionManagementSessionIdentity {
  const record = requireExactRecord(
    value,
    ['windowId'],
    'Agent Extension Management identity is invalid.',
  );
  return {
    windowId: requireNonEmptyString(
      record['windowId'],
      'Agent Extension Management Window identity is required.',
    ),
  };
}

function parseManagedSkill(value: unknown): AgentManagedSkillItem {
  const record = requireExactRecord(
    value,
    ['id', 'name', 'description', 'source', 'sourceId', 'managementId', 'canRemove'],
    'Agent Extension Management Skill item is invalid.',
  );
  const source = requireSkillSource(record['source']);
  const sourceId = requireNonEmptyString(
    record['sourceId'],
    'Agent Extension Management Skill source identity is required.',
  );
  const managementId = requireString(
    record['managementId'],
    'Agent Extension Management Skill management identity must be a string.',
  );
  const canRemove = requireBoolean(
    record['canRemove'],
    'Agent Extension Management Skill removal capability is invalid.',
  );
  if (source === 'plugin') {
    requirePluginId(sourceId);
  } else if (sourceId !== 'personal') {
    throw new Error('Agent Extension Management Skill source identity is inconsistent.');
  }
  if (canRemove !== managementId.length > 0 || (source === 'plugin' && canRemove)) {
    throw new Error('Agent Extension Management Skill removal capability is inconsistent.');
  }
  if (canRemove) requireManagementId(managementId);
  const id = requireNonEmptyString(
    record['id'],
    'Agent Extension Management Skill id is required.',
  );
  if (!id.startsWith(`${source}:${sourceId}:`)) {
    throw new Error('Agent Extension Management Skill identity is inconsistent.');
  }
  return {
    id,
    name: requireNonEmptyString(
      record['name'],
      'Agent Extension Management Skill name is required.',
    ),
    description: requireString(
      record['description'],
      'Agent Extension Management Skill description must be a string.',
    ),
    source,
    sourceId,
    managementId,
    canRemove,
  };
}

function parseSkillDiscovery(value: unknown): AgentExtensionManagementProjection['skillDiscovery'] {
  const record = requireExactRecord(
    value,
    ['diagnostics', 'duplicateCount'],
    'Agent Extension Management Skill discovery projection is invalid.',
  );
  if (!Array.isArray(record['diagnostics'])) {
    throw new Error('Agent Extension Management Skill diagnostics are invalid.');
  }
  return {
    diagnostics: record['diagnostics'].map((value) => {
      const diagnostic = requireExactRecord(
        value,
        ['code', 'source', 'count'],
        'Agent Extension Management Skill diagnostic is invalid.',
      );
      return {
        code: requireSkillDiagnosticCode(diagnostic['code']),
        source: requireSkillSource(diagnostic['source']),
        count: requirePositiveInteger(
          diagnostic['count'],
          'Agent Extension Management Skill diagnostic count is invalid.',
        ),
      };
    }),
    duplicateCount: requireNonNegativeInteger(
      record['duplicateCount'],
      'Agent Extension Management duplicate count is invalid.',
    ),
  };
}

function parseExtension(value: unknown): AgentExtensionCatalogItem {
  const record = requireExactRecord(
    value,
    [
      'id',
      'name',
      'displayName',
      'description',
      'version',
      'developer',
      'marketplace',
      'category',
      'installed',
      'enabled',
      'canInstall',
      'canUpdate',
      'canEnable',
      'canDisable',
      'canRemove',
      'updatePackageRelease',
      'deliverySource',
      'artifactPlatform',
      'downloadSizeBytes',
      'artifactStatus',
      'dependencyStatus',
      'enableGrantStatus',
      'hostPermissionStatus',
      'qualificationStatus',
      'declaredPermissions',
      'acceptedPermissions',
      'agentStatus',
      'runtimeDiagnosticCode',
      'iconDataUrl',
      'mcpServerIds',
      'hasSkills',
      'appIds',
    ],
    'Agent Extension Management extension item is invalid.',
  );
  const name = requireIdentifier(
    record['name'],
    'Agent Extension Management extension name is invalid.',
  );
  const marketplace = requireIdentifier(
    record['marketplace'],
    'Agent Extension Management marketplace is invalid.',
  );
  const id = requireNonEmptyString(
    record['id'],
    'Agent Extension Management extension id is required.',
  );
  if (id !== `${name}@${marketplace}`) {
    throw new Error('Agent Extension Management extension identity is inconsistent.');
  }
  const installed = requireBoolean(
    record['installed'],
    'Agent Extension Management installed flag is invalid.',
  );
  const enabled = requireBoolean(
    record['enabled'],
    'Agent Extension Management enabled flag is invalid.',
  );
  const canInstall = requireBoolean(
    record['canInstall'],
    'Agent Extension Management install flag is invalid.',
  );
  const canUpdate = requireBoolean(
    record['canUpdate'],
    'Agent Extension Management update flag is invalid.',
  );
  const canRemove = requireBoolean(
    record['canRemove'],
    'Agent Extension Management removal flag is invalid.',
  );
  const canEnable = requireBoolean(
    record['canEnable'],
    'Agent Extension Management enable flag is invalid.',
  );
  const canDisable = requireBoolean(
    record['canDisable'],
    'Agent Extension Management disable flag is invalid.',
  );
  const declaredPermissions = requireUniqueIdentifiers(
    record['declaredPermissions'],
    'Agent Extension Management declared permissions are invalid.',
  );
  const acceptedPermissions = requireUniqueIdentifiers(
    record['acceptedPermissions'],
    'Agent Extension Management accepted permissions are invalid.',
  );
  const updatePackageRelease = requireString(
    record['updatePackageRelease'],
    'Agent Extension Management update package release must be a string.',
  );
  const deliverySource = requireOneOf(
    record['deliverySource'],
    ['', 'github-release', 'official-download'] as const,
    'Agent Extension Management delivery source is invalid.',
  );
  const artifactPlatform = requireString(
    record['artifactPlatform'],
    'Agent Extension Management artifact platform must be a string.',
  );
  const downloadSizeBytes = requireNonNegativeInteger(
    record['downloadSizeBytes'],
    'Agent Extension Management artifact size is invalid.',
  );
  const artifactStatus = requireOneOf(
    record['artifactStatus'],
    ['unavailable', 'available', 'installed', 'invalid'] as const,
    'Agent Extension Management artifact status is invalid.',
  );
  const dependencyStatus = requireOneOf(
    record['dependencyStatus'],
    ['unchecked', 'ready', 'error'] as const,
    'Agent Extension Management dependency status is invalid.',
  );
  const enableGrantStatus = requireOneOf(
    record['enableGrantStatus'],
    ['not-required', 'required', 'accepted'] as const,
    'Agent Extension Management enable grant status is invalid.',
  );
  const hostPermissionStatus = requireOneOf(
    record['hostPermissionStatus'],
    ['not-applicable', 'unknown', 'granted', 'needs-permission', 'unsupported'] as const,
    'Agent Extension Management Host permission status is invalid.',
  );
  const qualificationStatus = requireOneOf(
    record['qualificationStatus'],
    ['unqualified', 'qualified', 'partial', 'failed'] as const,
    'Agent Extension Management qualification status is invalid.',
  );
  if (
    (canInstall && installed) ||
    canUpdate !== (installed && !enabled && updatePackageRelease.length > 0) ||
    (canUpdate && updatePackageRelease === record['version']) ||
    (canEnable && (!installed || enabled)) ||
    canDisable !== (installed && enabled) ||
    canRemove !== (installed && !enabled) ||
    (!installed && (enabled || acceptedPermissions.length > 0)) ||
    (acceptedPermissions.length > 0 && !sameStringSet(declaredPermissions, acceptedPermissions)) ||
    (enabled && !sameStringSet(declaredPermissions, acceptedPermissions)) ||
    (artifactStatus === 'available') !== canInstall ||
    (!installed && artifactStatus === 'installed') ||
    (installed && artifactStatus === 'available') ||
    (artifactStatus === 'unavailable' && downloadSizeBytes !== 0) ||
    (artifactStatus === 'unavailable' && deliverySource !== '') ||
    ((artifactStatus === 'available' || artifactStatus === 'installed') && deliverySource === '') ||
    (artifactStatus === 'invalid' && deliverySource !== '') ||
    (artifactStatus === 'invalid' && dependencyStatus !== 'error') ||
    (declaredPermissions.length === 0 && enableGrantStatus !== 'not-required') ||
    (declaredPermissions.length > 0 &&
      enableGrantStatus !==
        (sameStringSet(declaredPermissions, acceptedPermissions) ? 'accepted' : 'required'))
  ) {
    throw new Error('Agent Extension Management extension flags are inconsistent.');
  }
  const agentStatus = requireExtensionStatus(record['agentStatus']);
  if (
    (!installed &&
      agentStatus !== 'not-installed' &&
      !(agentStatus === 'unsupported' && !canInstall)) ||
    (installed && !enabled && agentStatus !== 'disabled' && agentStatus !== 'error')
  ) {
    throw new Error('Agent Extension Management extension status is inconsistent.');
  }
  return {
    id,
    name,
    displayName: requireNonEmptyString(
      record['displayName'],
      'Agent Extension Management display name is required.',
    ),
    description: requireString(
      record['description'],
      'Agent Extension Management description must be a string.',
    ),
    version: requireString(
      record['version'],
      'Agent Extension Management version must be a string.',
    ),
    developer: requireString(
      record['developer'],
      'Agent Extension Management developer must be a string.',
    ),
    marketplace,
    category: requireString(
      record['category'],
      'Agent Extension Management category must be a string.',
    ),
    installed,
    enabled,
    canInstall,
    canUpdate,
    canEnable,
    canDisable,
    canRemove,
    updatePackageRelease,
    deliverySource,
    artifactPlatform,
    downloadSizeBytes,
    artifactStatus,
    dependencyStatus,
    enableGrantStatus,
    hostPermissionStatus,
    qualificationStatus,
    declaredPermissions,
    acceptedPermissions,
    agentStatus,
    runtimeDiagnosticCode: requireDiagnosticValue(record['runtimeDiagnosticCode']),
    iconDataUrl: requireIconDataUrl(record['iconDataUrl']),
    mcpServerIds: requireUniqueIdentifiers(
      record['mcpServerIds'],
      'Agent Extension Management MCP Server ids are invalid.',
    ),
    hasSkills: requireBoolean(
      record['hasSkills'],
      'Agent Extension Management Skill contribution flag is invalid.',
    ),
    appIds: requireUniqueIdentifiers(
      record['appIds'],
      'Agent Extension Management App ids are invalid.',
    ),
  };
}

function parseExtensionDiscovery(
  value: unknown,
): AgentExtensionManagementProjection['extensionDiscovery'] {
  const record = requireExactRecord(
    value,
    ['diagnostics'],
    'Agent Extension Management extension discovery projection is invalid.',
  );
  if (!Array.isArray(record['diagnostics'])) {
    throw new Error('Agent Extension Management extension diagnostics are invalid.');
  }
  return {
    diagnostics: record['diagnostics'].map((value) => {
      const diagnostic = requireExactRecord(
        value,
        ['code', 'count'],
        'Agent Extension Management extension diagnostic is invalid.',
      );
      return {
        code: requireExtensionDiagnosticCode(diagnostic['code']),
        count: requirePositiveInteger(
          diagnostic['count'],
          'Agent Extension Management extension diagnostic count is invalid.',
        ),
      };
    }),
  };
}

function requireExactRecord(
  value: unknown,
  keys: readonly string[],
  message: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  const record = value as Readonly<Record<string, unknown>>;
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !keys.includes(key))
  ) {
    throw new Error(message);
  }
  return record;
}

function requirePluginId(value: unknown): string {
  const id = requireNonEmptyString(value, 'Agent Extension Management plugin id is required.');
  const separator = id.lastIndexOf('@');
  if (separator <= 0 || separator === id.length - 1) {
    throw new Error('Agent Extension Management plugin id is invalid.');
  }
  requireIdentifier(id.slice(0, separator), 'Agent Extension Management plugin id is invalid.');
  requireIdentifier(id.slice(separator + 1), 'Agent Extension Management plugin id is invalid.');
  return id;
}

function requireManagementId(value: unknown): string {
  const id = requireNonEmptyString(
    value,
    'Agent Extension Management Skill management id is required.',
  );
  if (!/^skill:[0-9a-f]{64}$/u.test(id)) {
    throw new Error('Agent Extension Management Skill management id is invalid.');
  }
  return id;
}

function requireUniqueIdentifiers(value: unknown, message: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(message);
  const identifiers = value.map((item) => requireIdentifier(item, message));
  if (new Set(identifiers).size !== identifiers.length) throw new Error(message);
  return identifiers;
}

function requireIdentifier(value: unknown, message: string): string {
  const identifier = requireNonEmptyString(value, message);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(identifier)) throw new Error(message);
  return identifier;
}

function requireDiagnosticValue(value: unknown): string {
  const code = requireString(
    value,
    'Agent Extension Management runtime diagnostic code must be a string.',
  );
  if (code !== '' && !/^[a-z][a-z0-9._-]*$/u.test(code)) {
    throw new Error('Agent Extension Management runtime diagnostic code is invalid.');
  }
  return code;
}

function requireIconDataUrl(value: unknown): string {
  const dataUrl = requireString(
    value,
    'Agent Extension Management icon data URL must be a string.',
  );
  if (
    dataUrl !== '' &&
    !/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/u.test(dataUrl)
  ) {
    throw new Error('Agent Extension Management icon data URL is invalid.');
  }
  return dataUrl;
}

function requireSkillSource(value: unknown): AgentManagedSkillItem['source'] {
  if (value !== 'personal' && value !== 'plugin') {
    throw new Error('Agent Extension Management Skill source is invalid.');
  }
  return value;
}

function requireSkillDiagnosticCode(
  value: unknown,
): AgentExtensionManagementProjection['skillDiscovery']['diagnostics'][number]['code'] {
  if (
    value !== 'file_info_failed' &&
    value !== 'list_failed' &&
    value !== 'read_failed' &&
    value !== 'parse_failed' &&
    value !== 'invalid_metadata'
  ) {
    throw new Error('Agent Extension Management Skill diagnostic code is invalid.');
  }
  return value;
}

function requireExtensionDiagnosticCode(value: unknown): AgentExtensionDiagnosticCode {
  if (
    value !== 'repository_unavailable' &&
    value !== 'repository_failed' &&
    value !== 'repository_invalid' &&
    value !== 'state_invalid' &&
    value !== 'manifest_invalid' &&
    value !== 'contribution_invalid' &&
    value !== 'runtime_unsupported' &&
    value !== 'runtime_failed' &&
    value !== 'skill_invalid'
  ) {
    throw new Error('Agent Extension Management extension diagnostic code is invalid.');
  }
  return value;
}

function requireExtensionStatus(value: unknown): AgentExtensionStatus {
  if (
    value !== 'not-installed' &&
    value !== 'disabled' &&
    value !== 'ready' &&
    value !== 'partial' &&
    value !== 'unsupported' &&
    value !== 'error'
  ) {
    throw new Error('Agent Extension Management extension status is invalid.');
  }
  return value;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function requireNonEmptyString(value: unknown, message: string): string {
  const text = requireString(value, message);
  if (text.length === 0) throw new Error(message);
  return text;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new Error(message);
  return value;
}

function requireBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') throw new Error(message);
  return value;
}

function requireOneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  message: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(message);
  return value;
}

function requirePositiveInteger(value: unknown, message: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value <= 0) throw new Error(message);
  return value;
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < 0) throw new Error(message);
  return value;
}
