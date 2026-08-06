// =============================================================================
// Storage contracts — host-neutral placement, ownership, and workspace identity
// =============================================================================

function join(...segments: string[]): string {
  return segments.join('/').replace(/\/+/g, '/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbsoluteFilesystemPath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

export type NekoStorageScope =
  | 'user-global'
  | 'project-fact'
  | 'project-local'
  | 'workspace-cache'
  | 'extension-private'
  | 'media-library'
  | 'scratch';

export type NekoStorageClass =
  | 'project-fact'
  | 'user-editable'
  | 'valuable-local-state'
  | 'rebuildable-metadata'
  | 'artifact-file'
  | 'raw-journal'
  | 'raw-log'
  | 'extension-private'
  | 'durable-media'
  | 'scratch';

export type NekoMetadataOwnership = 'state' | 'cache';

export type NekoStorageAuthorityKind =
  'file' | 'sqlite-state' | 'sqlite-cache' | 'secret-store' | 'log-file' | 'memory';

export type NekoStorageUserManagement = 'opaque' | 'ui-managed' | 'user-content';

export type NekoStoragePortability = 'machine-local' | 'workspace-portable' | 'user-exportable';

export type NekoStorageSensitivity = 'non-secret' | 'local-sensitive' | 'secret';

export type NekoStorageSqliteRole = 'authority' | 'projection' | 'prohibited';

export type NekoStorageDeletionPolicy =
  'owner-controlled' | 'user-controlled' | 'retention-controlled' | 'session-scoped';

export type NekoStorageRetentionPolicy =
  'owner-policy' | 'explicit-user-action' | 'rebuildable' | 'managed-rotation' | 'session';

export type NekoStorageDurability =
  'authoritative' | 'valuable-local-state' | 'rebuildable' | 'ephemeral';

export type NekoStorageOwner =
  | 'project-domain'
  | 'user'
  | 'agent'
  | 'local-metadata-store'
  | 'resource-cache'
  | 'host-extension'
  | 'media-library'
  | 'secret-store'
  | 'runtime';

export type NekoTrackingPolicy = 'git-trackable' | 'gitignored' | 'outside-workspace';

export type NekoCleanupPolicy =
  'never-automatic' | 'rebuildable-only' | 'retention-policy' | 'explicit-confirmation';

export type NekoBackupPolicy = 'required' | 'optional' | 'not-applicable';

export type NekoStorageDiagnosticCode =
  | 'unknown-managed-storage'
  | 'invalid-workspace-identity'
  | 'absolute-workspace-locator'
  | 'duplicate-workspace-identity'
  | 'ambiguous-workspace-locator'
  | 'deprecated-hook-catalog'
  | 'misplaced-personal-content'
  | 'misplaced-project-fact'
  | 'large-workspace-cache'
  | 'workspace-logs-present'
  | 'preview-recordings-present'
  | 'import-staging-present'
  | 'temporary-storage-present'
  | 'deprecated-workspace-directory'
  | 'workspace-local-not-gitignored'
  | 'project-facts-gitignored';

export type NekoStorageClassificationId =
  | 'project-facts'
  | 'user-editable-global'
  | 'user-editable-project'
  | 'valuable-local-state'
  | 'rebuildable-metadata'
  | 'workspace-cache-artifacts'
  | 'conversation-journals'
  | 'raw-logs'
  | 'extension-private-files'
  | 'retained-media'
  | 'scratch-data'
  | 'secret-credentials'
  | 'ephemeral-memory';

export interface NekoStorageClassification {
  readonly id: NekoStorageClassificationId;
  readonly scope: NekoStorageScope;
  readonly storageClass: NekoStorageClass;
  readonly metadataOwnership: NekoMetadataOwnership | null;
  readonly durability: NekoStorageDurability;
  readonly owner: NekoStorageOwner;
  readonly authorityKind: NekoStorageAuthorityKind;
  readonly userManagement: NekoStorageUserManagement;
  readonly portability: NekoStoragePortability;
  readonly sensitivity: NekoStorageSensitivity;
  readonly sqliteRole: NekoStorageSqliteRole;
  readonly deletion: NekoStorageDeletionPolicy;
  readonly retention: NekoStorageRetentionPolicy;
  readonly defaultLocation: string;
  readonly tracking: NekoTrackingPolicy;
  readonly cleanup: NekoCleanupPolicy;
  readonly backup: NekoBackupPolicy;
}

export type NekoStorageAdmissionDataKind =
  | 'structured-state'
  | 'structured-metadata'
  | 'raw-log'
  | 'journal'
  | 'user-content'
  | 'large-artifact'
  | 'ephemeral';

export interface NekoStorageAdmissionRequest {
  readonly dataKind: NekoStorageAdmissionDataKind;
  readonly userManagement: NekoStorageUserManagement;
  readonly portability: NekoStoragePortability;
  readonly sensitivity: NekoStorageSensitivity;
  readonly rebuildable: boolean;
}

export interface NekoStorageAdmissionDecision {
  readonly authorityKind: NekoStorageAuthorityKind;
  readonly sqliteRole: NekoStorageSqliteRole;
  readonly reason:
    | 'secret-boundary'
    | 'append-oriented-evidence'
    | 'user-managed-or-portable'
    | 'large-byte-content'
    | 'ephemeral-state'
    | 'rebuildable-structured-metadata'
    | 'machine-local-ui-state';
}

export interface NekoStorageDiagnostic {
  readonly code: NekoStorageDiagnosticCode;
  readonly message: string;
}

export class NekoStorageContractError extends Error {
  readonly code: NekoStorageDiagnosticCode;

  constructor(diagnostic: NekoStorageDiagnostic) {
    super(diagnostic.message);
    this.name = 'NekoStorageContractError';
    this.code = diagnostic.code;
  }
}

const STORAGE_CLASSIFICATIONS: Readonly<
  Record<NekoStorageClassificationId, NekoStorageClassification>
> = {
  'project-facts': {
    id: 'project-facts',
    scope: 'project-fact',
    storageClass: 'project-fact',
    metadataOwnership: null,
    durability: 'authoritative',
    owner: 'project-domain',
    authorityKind: 'file',
    userManagement: 'user-content',
    portability: 'workspace-portable',
    sensitivity: 'non-secret',
    sqliteRole: 'prohibited',
    deletion: 'user-controlled',
    retention: 'owner-policy',
    defaultLocation: '<workspace>/neko/',
    tracking: 'git-trackable',
    cleanup: 'never-automatic',
    backup: 'required',
  },
  'user-editable-global': {
    id: 'user-editable-global',
    scope: 'user-global',
    storageClass: 'user-editable',
    metadataOwnership: null,
    durability: 'authoritative',
    owner: 'user',
    authorityKind: 'file',
    userManagement: 'user-content',
    portability: 'user-exportable',
    sensitivity: 'local-sensitive',
    sqliteRole: 'prohibited',
    deletion: 'user-controlled',
    retention: 'explicit-user-action',
    defaultLocation: '~/.neko/',
    tracking: 'outside-workspace',
    cleanup: 'never-automatic',
    backup: 'required',
  },
  'user-editable-project': {
    id: 'user-editable-project',
    scope: 'project-local',
    storageClass: 'user-editable',
    metadataOwnership: null,
    durability: 'authoritative',
    owner: 'user',
    authorityKind: 'file',
    userManagement: 'user-content',
    portability: 'workspace-portable',
    sensitivity: 'non-secret',
    sqliteRole: 'prohibited',
    deletion: 'user-controlled',
    retention: 'owner-policy',
    defaultLocation: '<workspace>/neko/',
    tracking: 'git-trackable',
    cleanup: 'never-automatic',
    backup: 'required',
  },
  'valuable-local-state': {
    id: 'valuable-local-state',
    scope: 'user-global',
    storageClass: 'valuable-local-state',
    metadataOwnership: 'state',
    durability: 'valuable-local-state',
    owner: 'local-metadata-store',
    authorityKind: 'sqlite-state',
    userManagement: 'ui-managed',
    portability: 'machine-local',
    sensitivity: 'non-secret',
    sqliteRole: 'authority',
    deletion: 'owner-controlled',
    retention: 'owner-policy',
    defaultLocation: '~/.neko/neko.db#state',
    tracking: 'outside-workspace',
    cleanup: 'explicit-confirmation',
    backup: 'required',
  },
  'rebuildable-metadata': {
    id: 'rebuildable-metadata',
    scope: 'user-global',
    storageClass: 'rebuildable-metadata',
    metadataOwnership: 'cache',
    durability: 'rebuildable',
    owner: 'local-metadata-store',
    authorityKind: 'sqlite-cache',
    userManagement: 'opaque',
    portability: 'machine-local',
    sensitivity: 'local-sensitive',
    sqliteRole: 'projection',
    deletion: 'owner-controlled',
    retention: 'rebuildable',
    defaultLocation: '~/.neko/neko.db#cache',
    tracking: 'outside-workspace',
    cleanup: 'rebuildable-only',
    backup: 'optional',
  },
  'workspace-cache-artifacts': {
    id: 'workspace-cache-artifacts',
    scope: 'workspace-cache',
    storageClass: 'artifact-file',
    metadataOwnership: null,
    durability: 'rebuildable',
    owner: 'resource-cache',
    authorityKind: 'file',
    userManagement: 'opaque',
    portability: 'machine-local',
    sensitivity: 'local-sensitive',
    sqliteRole: 'prohibited',
    deletion: 'owner-controlled',
    retention: 'rebuildable',
    defaultLocation: '~/.neko/workspace-cache/<workspaceId>/',
    tracking: 'outside-workspace',
    cleanup: 'rebuildable-only',
    backup: 'not-applicable',
  },
  'conversation-journals': {
    id: 'conversation-journals',
    scope: 'user-global',
    storageClass: 'raw-journal',
    metadataOwnership: null,
    durability: 'authoritative',
    owner: 'agent',
    authorityKind: 'file',
    userManagement: 'user-content',
    portability: 'user-exportable',
    sensitivity: 'local-sensitive',
    sqliteRole: 'prohibited',
    deletion: 'user-controlled',
    retention: 'explicit-user-action',
    defaultLocation: '~/.neko/journals/',
    tracking: 'outside-workspace',
    cleanup: 'never-automatic',
    backup: 'required',
  },
  'raw-logs': {
    id: 'raw-logs',
    scope: 'user-global',
    storageClass: 'raw-log',
    metadataOwnership: null,
    durability: 'valuable-local-state',
    owner: 'host-extension',
    authorityKind: 'log-file',
    userManagement: 'opaque',
    portability: 'machine-local',
    sensitivity: 'local-sensitive',
    sqliteRole: 'prohibited',
    deletion: 'retention-controlled',
    retention: 'managed-rotation',
    defaultLocation: '<managed-log-root>/',
    tracking: 'outside-workspace',
    cleanup: 'retention-policy',
    backup: 'optional',
  },
  'extension-private-files': {
    id: 'extension-private-files',
    scope: 'extension-private',
    storageClass: 'extension-private',
    metadataOwnership: null,
    durability: 'rebuildable',
    owner: 'host-extension',
    authorityKind: 'file',
    userManagement: 'opaque',
    portability: 'machine-local',
    sensitivity: 'local-sensitive',
    sqliteRole: 'prohibited',
    deletion: 'retention-controlled',
    retention: 'owner-policy',
    defaultLocation: '<globalStorageUri>/',
    tracking: 'outside-workspace',
    cleanup: 'retention-policy',
    backup: 'not-applicable',
  },
  'retained-media': {
    id: 'retained-media',
    scope: 'media-library',
    storageClass: 'durable-media',
    metadataOwnership: null,
    durability: 'authoritative',
    owner: 'media-library',
    authorityKind: 'file',
    userManagement: 'user-content',
    portability: 'user-exportable',
    sensitivity: 'non-secret',
    sqliteRole: 'prohibited',
    deletion: 'user-controlled',
    retention: 'explicit-user-action',
    defaultLocation: '<workspace-or-media-library>/',
    tracking: 'gitignored',
    cleanup: 'explicit-confirmation',
    backup: 'required',
  },
  'scratch-data': {
    id: 'scratch-data',
    scope: 'scratch',
    storageClass: 'scratch',
    metadataOwnership: null,
    durability: 'ephemeral',
    owner: 'host-extension',
    authorityKind: 'file',
    userManagement: 'opaque',
    portability: 'machine-local',
    sensitivity: 'local-sensitive',
    sqliteRole: 'prohibited',
    deletion: 'session-scoped',
    retention: 'session',
    defaultLocation: '<managed-scratch-root>/',
    tracking: 'gitignored',
    cleanup: 'retention-policy',
    backup: 'not-applicable',
  },
  'secret-credentials': {
    id: 'secret-credentials',
    scope: 'user-global',
    storageClass: 'valuable-local-state',
    metadataOwnership: null,
    durability: 'valuable-local-state',
    owner: 'secret-store',
    authorityKind: 'secret-store',
    userManagement: 'ui-managed',
    portability: 'machine-local',
    sensitivity: 'secret',
    sqliteRole: 'prohibited',
    deletion: 'user-controlled',
    retention: 'explicit-user-action',
    defaultLocation: '<system-credential-store>/',
    tracking: 'outside-workspace',
    cleanup: 'explicit-confirmation',
    backup: 'not-applicable',
  },
  'ephemeral-memory': {
    id: 'ephemeral-memory',
    scope: 'scratch',
    storageClass: 'scratch',
    metadataOwnership: null,
    durability: 'ephemeral',
    owner: 'runtime',
    authorityKind: 'memory',
    userManagement: 'opaque',
    portability: 'machine-local',
    sensitivity: 'local-sensitive',
    sqliteRole: 'prohibited',
    deletion: 'session-scoped',
    retention: 'session',
    defaultLocation: '<process-memory>/',
    tracking: 'outside-workspace',
    cleanup: 'retention-policy',
    backup: 'not-applicable',
  },
};

function isNekoStorageClassificationId(value: string): value is NekoStorageClassificationId {
  return Object.prototype.hasOwnProperty.call(STORAGE_CLASSIFICATIONS, value);
}

export function getNekoStorageClassification(id: string): NekoStorageClassification {
  if (isNekoStorageClassificationId(id)) {
    return STORAGE_CLASSIFICATIONS[id];
  }
  throw new NekoStorageContractError({
    code: 'unknown-managed-storage',
    message: `Unknown Neko-managed storage classification: ${id}`,
  });
}

export function listNekoStorageClassifications(): readonly NekoStorageClassification[] {
  return Object.values(STORAGE_CLASSIFICATIONS);
}

export function decideNekoStorageAuthority(
  request: NekoStorageAdmissionRequest,
): NekoStorageAdmissionDecision {
  if (request.sensitivity === 'secret') {
    return { authorityKind: 'secret-store', sqliteRole: 'prohibited', reason: 'secret-boundary' };
  }
  if (request.dataKind === 'raw-log') {
    return {
      authorityKind: 'log-file',
      sqliteRole: 'prohibited',
      reason: 'append-oriented-evidence',
    };
  }
  if (
    request.dataKind === 'journal' ||
    request.dataKind === 'user-content' ||
    request.userManagement === 'user-content' ||
    request.portability !== 'machine-local'
  ) {
    return { authorityKind: 'file', sqliteRole: 'prohibited', reason: 'user-managed-or-portable' };
  }
  if (request.dataKind === 'large-artifact') {
    return { authorityKind: 'file', sqliteRole: 'prohibited', reason: 'large-byte-content' };
  }
  if (request.dataKind === 'ephemeral') {
    return { authorityKind: 'memory', sqliteRole: 'prohibited', reason: 'ephemeral-state' };
  }
  if (request.rebuildable || request.dataKind === 'structured-metadata') {
    return {
      authorityKind: 'sqlite-cache',
      sqliteRole: 'projection',
      reason: 'rebuildable-structured-metadata',
    };
  }
  if (request.dataKind === 'structured-state' && request.userManagement === 'ui-managed') {
    return {
      authorityKind: 'sqlite-state',
      sqliteRole: 'authority',
      reason: 'machine-local-ui-state',
    };
  }
  throw new NekoStorageContractError({
    code: 'unknown-managed-storage',
    message: 'Storage admission request does not match an approved authority.',
  });
}

/** User-level global storage roots (`~/.neko/` plus portable `~/.agents/skills`). */
export interface IGlobalStorageLayout {
  readonly root: string;
  readonly database: string;
  readonly assets: string;
  readonly mediaLibraries: string;
  readonly journals: string;
  readonly logs: string;
  readonly desktopLogs: string;
  readonly workspaceLogs: string;
  readonly agentLogs: string;
  readonly workspaceCaches: string;
  readonly skills: string;
  readonly commands: string;
  readonly prompts: string;
  readonly marketCache: string;
  readonly marketInstalled: string;
  readonly conversations: string;
  readonly providerCards: string;
  readonly profiles: string;
  readonly processors: string;
  readonly agentsMd: string;
  readonly config: string;
}

/** Project facts (`neko/`) — Git-trackable and team-shared. */
export interface IProjectFactsLayout {
  readonly root: string;
  readonly identity: string;
  readonly settings: string;
  readonly providerCards: string;
  readonly entityBindings: string;
}

export interface IProjectStorageLayout {
  readonly facts: IProjectFactsLayout;
}

export interface IStorageLayout {
  readonly global: IGlobalStorageLayout;
  readonly project: IProjectStorageLayout;
}

export type ManagedLogOwner =
  | { readonly kind: 'desktop' }
  | { readonly kind: 'agent' }
  | { readonly kind: 'workspace'; readonly workspaceId: string };

export function resolveGlobalStorageLayout(homedir: string): IGlobalStorageLayout {
  const root = join(homedir, '.neko');
  return {
    root,
    database: join(root, 'neko.db'),
    assets: join(root, 'assets'),
    mediaLibraries: join(root, 'media-libraries'),
    journals: join(root, 'journals'),
    logs: join(root, 'logs'),
    desktopLogs: join(root, 'logs', 'desktop'),
    workspaceLogs: join(root, 'logs', 'workspaces'),
    agentLogs: join(root, 'logs', 'agent'),
    workspaceCaches: join(root, 'workspace-cache'),
    skills: join(homedir, '.agents', 'skills'),
    commands: join(root, 'commands'),
    prompts: join(root, 'prompts'),
    agentsMd: join(root, 'AGENTS.md'),
    config: join(root, 'config.toml'),
    marketCache: join(root, 'market-cache'),
    marketInstalled: join(root, 'market-installed.json'),
    conversations: join(root, 'conversations'),
    providerCards: join(root, 'providers'),
    profiles: join(root, 'profiles'),
    processors: join(root, 'processors'),
  };
}

export function resolveStorageLayout(workspaceRoot: string, homedir: string): IStorageLayout {
  const factsRoot = join(workspaceRoot, 'neko');

  const facts: IProjectFactsLayout = {
    root: factsRoot,
    identity: join(factsRoot, 'project.json'),
    settings: join(factsRoot, 'settings.json'),
    providerCards: join(factsRoot, 'providers'),
    entityBindings: join(factsRoot, 'entity-bindings.json'),
  };

  return {
    global: resolveGlobalStorageLayout(homedir),
    project: { facts },
  };
}

export function resolveWorkspaceCachePartition(homedir: string, workspaceId: string): string {
  if (!isWorkspaceId(workspaceId)) {
    throw new NekoStorageContractError({
      code: 'invalid-workspace-identity',
      message: 'Workspace cache partition requires a valid workspaceId.',
    });
  }
  return join(resolveGlobalStorageLayout(homedir).workspaceCaches, workspaceId);
}

export function resolveManagedLogFile(homedir: string, owner: ManagedLogOwner): string {
  const layout = resolveGlobalStorageLayout(homedir);
  switch (owner.kind) {
    case 'desktop':
      return join(layout.desktopLogs, 'desktop.ndjson');
    case 'agent':
      return join(layout.agentLogs, 'agent.ndjson');
    case 'workspace':
      if (!isWorkspaceId(owner.workspaceId)) {
        throw new NekoStorageContractError({
          code: 'invalid-workspace-identity',
          message: 'Workspace log partition requires a valid workspaceId.',
        });
      }
      return join(layout.workspaceLogs, owner.workspaceId, 'workspace.ndjson');
  }
}

export function assertCanonicalMetadataDatabasePath(path: string, homedir: string): void {
  const canonicalPath = resolveGlobalStorageLayout(homedir).database;
  if (path === canonicalPath) return;
  throw new NekoStorageContractError({
    code: 'unknown-managed-storage',
    message: `SQLite metadata must use ${canonicalPath}; received ${path}`,
  });
}

export const WORKSPACE_IDENTITY_RELATIVE_PATH = 'neko/project.json';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isIdentifierStart(character: string): boolean {
  const code = character.charCodeAt(0);
  return character === '_' || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isIdentifierPart(character: string): boolean {
  const code = character.charCodeAt(0);
  return isIdentifierStart(character) || (code >= 48 && code <= 57);
}

function isVariableWorkspaceLocator(value: string): boolean {
  if (!value.startsWith('${')) return false;
  const closingBrace = value.indexOf('}');
  if (closingBrace < 3) return false;
  const variableName = value.slice(2, closingBrace);
  if (!isIdentifierStart(variableName[0] ?? '')) return false;
  for (const character of variableName.slice(1)) {
    if (!isIdentifierPart(character)) return false;
  }
  const remainder = value.slice(closingBrace + 1);
  return remainder.length === 0 || remainder.startsWith('/');
}

export interface WorkspaceIdentityDescriptor {
  readonly [metadata: string]: unknown;
  readonly workspaceId: string;
}

export interface WorkspaceIdentityFilePort {
  readFileIfExists(path: string): Promise<string | null>;
  ensureParentDirectory(path: string): Promise<void>;
  writeFileExclusive(path: string, content: string): Promise<'written' | 'exists'>;
  createWorkspaceId(): string;
}

export interface WorkspacePortableLocator {
  readonly kind: 'relative' | 'variable';
  readonly value: string;
}

export interface WorkspaceLocatorObservation {
  readonly workspaceId: string;
  readonly locator: WorkspacePortableLocator;
  readonly status: 'live' | 'inactive';
}

export interface WorkspaceIdentityBinding {
  readonly workspaceId: string;
  readonly currentLocator: WorkspacePortableLocator;
  readonly locatorHistory: readonly WorkspacePortableLocator[];
  readonly lastSeenAt: string;
  readonly orphanedAt: string | null;
}

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function parseWorkspaceIdentityDescriptor(value: unknown): WorkspaceIdentityDescriptor {
  if (!isRecord(value)) {
    throw new NekoStorageContractError({
      code: 'invalid-workspace-identity',
      message: 'Workspace identity descriptor must be an object',
    });
  }
  if (!isWorkspaceId(value.workspaceId)) {
    throw new NekoStorageContractError({
      code: 'invalid-workspace-identity',
      message: 'Workspace identity workspaceId must be a valid UUID',
    });
  }
  return { ...value, workspaceId: value.workspaceId };
}

export function parseWorkspaceIdentityJson(json: string): WorkspaceIdentityDescriptor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new NekoStorageContractError({
      code: 'invalid-workspace-identity',
      message: `Workspace identity descriptor is not valid JSON: ${String(error)}`,
    });
  }
  return parseWorkspaceIdentityDescriptor(parsed);
}

export function serializeWorkspaceIdentityDescriptor(
  descriptor: WorkspaceIdentityDescriptor,
): string {
  const validated = parseWorkspaceIdentityDescriptor(descriptor);
  return `${JSON.stringify(validated, null, 2)}\n`;
}

export async function ensureWorkspaceIdentityDescriptor(
  workspaceRoot: string,
  filePort: WorkspaceIdentityFilePort,
): Promise<WorkspaceIdentityDescriptor> {
  const descriptorPath = join(workspaceRoot, WORKSPACE_IDENTITY_RELATIVE_PATH);
  const existing = await filePort.readFileIfExists(descriptorPath);
  if (existing !== null) {
    return parseWorkspaceIdentityJson(existing);
  }

  const candidate = parseWorkspaceIdentityDescriptor({
    workspaceId: filePort.createWorkspaceId(),
  });
  await filePort.ensureParentDirectory(descriptorPath);
  const result = await filePort.writeFileExclusive(
    descriptorPath,
    serializeWorkspaceIdentityDescriptor(candidate),
  );
  if (result === 'written') return candidate;

  const winner = await filePort.readFileIfExists(descriptorPath);
  if (winner === null) {
    throw new NekoStorageContractError({
      code: 'invalid-workspace-identity',
      message: `Workspace identity creation raced but no descriptor exists at ${descriptorPath}`,
    });
  }
  return parseWorkspaceIdentityJson(winner);
}

export function createWorkspacePortableLocator(value: string): WorkspacePortableLocator {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized || isAbsoluteFilesystemPath(normalized)) {
    throw new NekoStorageContractError({
      code: 'absolute-workspace-locator',
      message: `Workspace locator must be relative or variable-based: ${value}`,
    });
  }
  const variableLocator = isVariableWorkspaceLocator(normalized);
  if (normalized.includes('${') && !variableLocator) {
    throw new NekoStorageContractError({
      code: 'invalid-workspace-identity',
      message: `Workspace locator contains an invalid variable reference: ${value}`,
    });
  }
  return {
    kind: variableLocator ? 'variable' : 'relative',
    value: normalized,
  };
}

export function updateWorkspaceIdentityBinding(
  binding: WorkspaceIdentityBinding,
  locator: WorkspacePortableLocator,
  seenAt: string,
): WorkspaceIdentityBinding {
  const locatorHistory = binding.locatorHistory.some((item) => item.value === locator.value)
    ? binding.locatorHistory
    : [...binding.locatorHistory, locator];
  return {
    workspaceId: binding.workspaceId,
    currentLocator: locator,
    locatorHistory,
    lastSeenAt: seenAt,
    orphanedAt: null,
  };
}

export function markWorkspaceIdentityOrphaned(
  binding: WorkspaceIdentityBinding,
  orphanedAt: string,
): WorkspaceIdentityBinding {
  return { ...binding, orphanedAt };
}

export function diagnoseDuplicateWorkspaceIdentity(
  observations: readonly WorkspaceLocatorObservation[],
): NekoStorageDiagnostic | null {
  const liveLocatorsByWorkspace = new Map<string, Set<string>>();
  for (const observation of observations) {
    if (observation.status !== 'live') continue;
    const locators = liveLocatorsByWorkspace.get(observation.workspaceId) ?? new Set<string>();
    locators.add(observation.locator.value);
    liveLocatorsByWorkspace.set(observation.workspaceId, locators);
  }
  for (const [workspaceId, locators] of liveLocatorsByWorkspace) {
    if (locators.size > 1) {
      return {
        code: 'duplicate-workspace-identity',
        message: `Workspace identity ${workspaceId} is active at multiple locators: ${[...locators].join(', ')}`,
      };
    }
  }
  return null;
}
