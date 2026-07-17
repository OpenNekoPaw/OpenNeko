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
  | 'project-cache'
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

export type NekoStorageDurability =
  'authoritative' | 'valuable-local-state' | 'rebuildable' | 'ephemeral';

export type NekoStorageOwner =
  | 'project-domain'
  | 'user'
  | 'agent'
  | 'local-metadata-store'
  | 'resource-cache'
  | 'host-extension'
  | 'media-library';

export type NekoTrackingPolicy = 'git-trackable' | 'gitignored' | 'outside-workspace';

export type NekoCleanupPolicy =
  'never-automatic' | 'rebuildable-only' | 'retention-policy' | 'explicit-confirmation';

export type NekoMigrationPolicy =
  'none' | 'backup-and-migrate' | 'rebuild' | 'promote' | 'diagnose';

export type NekoBackupPolicy = 'required' | 'optional' | 'not-applicable';

export type NekoStorageDiagnosticCode =
  | 'unknown-managed-storage'
  | 'retired-workspace-database'
  | 'invalid-workspace-identity'
  | 'workspace-identity-version-mismatch'
  | 'absolute-workspace-locator'
  | 'duplicate-workspace-identity'
  | 'ambiguous-workspace-locator'
  | 'deprecated-hook-catalog'
  | 'misplaced-personal-content'
  | 'legacy-workspace-metadata'
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
  | 'scratch-data';

export interface NekoStorageClassification {
  readonly id: NekoStorageClassificationId;
  readonly scope: NekoStorageScope;
  readonly storageClass: NekoStorageClass;
  readonly metadataOwnership: NekoMetadataOwnership | null;
  readonly durability: NekoStorageDurability;
  readonly owner: NekoStorageOwner;
  readonly defaultLocation: string;
  readonly tracking: NekoTrackingPolicy;
  readonly cleanup: NekoCleanupPolicy;
  readonly migration: NekoMigrationPolicy;
  readonly backup: NekoBackupPolicy;
}

export interface NekoStorageDiagnostic {
  readonly code: NekoStorageDiagnosticCode;
  readonly message: string;
}

export type NekoManagedContentKind =
  'hook' | 'skill' | 'command' | 'prompt' | 'processor' | 'agents';

export interface WorkspaceContentPlacementObservation {
  readonly relativePath: string;
  readonly kind: NekoManagedContentKind;
  readonly intendedScope: 'personal' | 'project' | 'unknown';
}

export interface WorkspaceContentPlacementDiagnostic extends NekoStorageDiagnostic {
  readonly code: 'deprecated-hook-catalog' | 'misplaced-personal-content';
  readonly relativePath: string;
  readonly kind: NekoManagedContentKind;
  readonly suggestedTarget: string;
}

export type WorkspaceStorageInspectionEntryKind =
  | 'legacy-database'
  | 'legacy-manifest'
  | 'legacy-projection'
  | 'misplaced-project-fact'
  | 'misplaced-personal-content'
  | 'large-cache'
  | 'raw-logs'
  | 'preview-recordings'
  | 'import-staging'
  | 'temporary-storage'
  | 'deprecated-directory';

export interface WorkspaceStorageInspectionEntry extends NekoStorageDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly relativePath: string;
  readonly kind: WorkspaceStorageInspectionEntryKind;
  readonly sizeBytes: number | null;
  readonly suggestedTarget?: string;
  readonly requiresExplicitAction: boolean;
}

export interface WorkspaceStorageInspectionReport {
  readonly workspaceRoot: string;
  readonly inspectedRoot: string;
  readonly totalCacheBytes: number;
  readonly largeCacheThresholdBytes: number;
  readonly entries: readonly WorkspaceStorageInspectionEntry[];
}

export interface WorkspaceGitIgnoreMatch {
  readonly ignored: boolean;
  readonly matchedRule: string | null;
}

export interface WorkspaceGitHygieneDiagnostic extends NekoStorageDiagnostic {
  readonly code: 'workspace-local-not-gitignored' | 'project-facts-gitignored';
  readonly severity: 'warning' | 'error';
  readonly matchedRule: string | null;
}

export interface WorkspaceGitHygieneReport {
  readonly gitignorePath: string;
  readonly updated: boolean;
  readonly workspaceLocal: WorkspaceGitIgnoreMatch;
  readonly projectFacts: WorkspaceGitIgnoreMatch;
  readonly diagnostics: readonly WorkspaceGitHygieneDiagnostic[];
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
    defaultLocation: '<workspace>/neko/',
    tracking: 'git-trackable',
    cleanup: 'never-automatic',
    migration: 'backup-and-migrate',
    backup: 'required',
  },
  'user-editable-global': {
    id: 'user-editable-global',
    scope: 'user-global',
    storageClass: 'user-editable',
    metadataOwnership: null,
    durability: 'authoritative',
    owner: 'user',
    defaultLocation: '~/.neko/',
    tracking: 'outside-workspace',
    cleanup: 'never-automatic',
    migration: 'backup-and-migrate',
    backup: 'required',
  },
  'user-editable-project': {
    id: 'user-editable-project',
    scope: 'project-local',
    storageClass: 'user-editable',
    metadataOwnership: null,
    durability: 'authoritative',
    owner: 'user',
    defaultLocation: '<workspace>/.neko/',
    tracking: 'gitignored',
    cleanup: 'never-automatic',
    migration: 'diagnose',
    backup: 'required',
  },
  'valuable-local-state': {
    id: 'valuable-local-state',
    scope: 'user-global',
    storageClass: 'valuable-local-state',
    metadataOwnership: 'state',
    durability: 'valuable-local-state',
    owner: 'local-metadata-store',
    defaultLocation: '~/.neko/neko.db#state',
    tracking: 'outside-workspace',
    cleanup: 'explicit-confirmation',
    migration: 'backup-and-migrate',
    backup: 'required',
  },
  'rebuildable-metadata': {
    id: 'rebuildable-metadata',
    scope: 'user-global',
    storageClass: 'rebuildable-metadata',
    metadataOwnership: 'cache',
    durability: 'rebuildable',
    owner: 'local-metadata-store',
    defaultLocation: '~/.neko/neko.db#cache',
    tracking: 'outside-workspace',
    cleanup: 'rebuildable-only',
    migration: 'rebuild',
    backup: 'optional',
  },
  'workspace-cache-artifacts': {
    id: 'workspace-cache-artifacts',
    scope: 'project-cache',
    storageClass: 'artifact-file',
    metadataOwnership: null,
    durability: 'rebuildable',
    owner: 'resource-cache',
    defaultLocation: '<workspace>/.neko/.cache/',
    tracking: 'gitignored',
    cleanup: 'rebuildable-only',
    migration: 'rebuild',
    backup: 'not-applicable',
  },
  'conversation-journals': {
    id: 'conversation-journals',
    scope: 'user-global',
    storageClass: 'raw-journal',
    metadataOwnership: null,
    durability: 'authoritative',
    owner: 'agent',
    defaultLocation: '~/.neko/journals/',
    tracking: 'outside-workspace',
    cleanup: 'never-automatic',
    migration: 'backup-and-migrate',
    backup: 'required',
  },
  'raw-logs': {
    id: 'raw-logs',
    scope: 'project-local',
    storageClass: 'raw-log',
    metadataOwnership: null,
    durability: 'valuable-local-state',
    owner: 'host-extension',
    defaultLocation: '<managed-log-root>/',
    tracking: 'gitignored',
    cleanup: 'retention-policy',
    migration: 'diagnose',
    backup: 'optional',
  },
  'extension-private-files': {
    id: 'extension-private-files',
    scope: 'extension-private',
    storageClass: 'extension-private',
    metadataOwnership: null,
    durability: 'rebuildable',
    owner: 'host-extension',
    defaultLocation: '<globalStorageUri>/',
    tracking: 'outside-workspace',
    cleanup: 'retention-policy',
    migration: 'rebuild',
    backup: 'not-applicable',
  },
  'retained-media': {
    id: 'retained-media',
    scope: 'media-library',
    storageClass: 'durable-media',
    metadataOwnership: null,
    durability: 'authoritative',
    owner: 'media-library',
    defaultLocation: '<workspace-or-media-library>/',
    tracking: 'gitignored',
    cleanup: 'explicit-confirmation',
    migration: 'promote',
    backup: 'required',
  },
  'scratch-data': {
    id: 'scratch-data',
    scope: 'scratch',
    storageClass: 'scratch',
    metadataOwnership: null,
    durability: 'ephemeral',
    owner: 'host-extension',
    defaultLocation: '<managed-scratch-root>/',
    tracking: 'gitignored',
    cleanup: 'retention-policy',
    migration: 'promote',
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

export function diagnoseWorkspaceContentPlacement(
  observations: readonly WorkspaceContentPlacementObservation[],
): readonly WorkspaceContentPlacementDiagnostic[] {
  const diagnostics: WorkspaceContentPlacementDiagnostic[] = [];
  for (const observation of observations) {
    const relativePath = normalizeWorkspaceContentPath(observation.relativePath);
    if (relativePath === '.neko/hooks' || relativePath.startsWith('.neko/hooks/')) {
      diagnostics.push({
        code: 'deprecated-hook-catalog',
        kind: observation.kind,
        relativePath,
        suggestedTarget: '.neko/settings.local.json',
        message:
          'Deprecated .neko/hooks content must be converted to settings-based hook configuration.',
      });
      continue;
    }
    if (
      observation.intendedScope === 'personal' &&
      (relativePath === '.neko' ||
        relativePath.startsWith('.neko/') ||
        relativePath === '.agents/skills' ||
        relativePath.startsWith('.agents/skills/'))
    ) {
      diagnostics.push({
        code: 'misplaced-personal-content',
        kind: observation.kind,
        relativePath,
        suggestedTarget: personalContentTarget(observation.kind),
        message: `Personal ${managedContentLabel(observation.kind)} content is misplaced in workspace-local storage.`,
      });
    }
  }
  return diagnostics;
}

function normalizeWorkspaceContentPath(value: string): string {
  return value.replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/\/+$/u, '');
}

function personalContentTarget(kind: NekoManagedContentKind): string {
  switch (kind) {
    case 'skill':
      return '~/.agents/skills';
    case 'command':
      return '~/.neko/commands';
    case 'prompt':
      return '~/.neko/prompts';
    case 'processor':
      return '~/.neko/processors';
    case 'agents':
      return '~/.neko/AGENTS.md';
    case 'hook':
      return '~/.neko/settings.json';
  }
}

function managedContentLabel(kind: NekoManagedContentKind): string {
  return kind === 'agents' ? 'AGENTS' : kind;
}

/** User-level global storage roots (`~/.neko/` plus portable `~/.agents/skills`). */
export interface IGlobalStorageLayout {
  readonly root: string;
  readonly database: string;
  readonly journals: string;
  readonly logs: string;
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
  readonly settings: string;
  readonly assetLibrary: string;
  readonly providerCards: string;
  readonly entityBindings: string;
  readonly visualIdentityDrafts: string;
  readonly entityAssetRequirements: string;
}

/** Project cache artifacts (`.neko/.cache/`) — derived and not Git-tracked. */
export interface ICacheLayout {
  readonly root: string;
  readonly mediaMetadata: string;
  readonly thumbnails: string;
  readonly resources: string;
  readonly resourceManifest: string;
  readonly proxies: string;
  readonly proxyManifest: string;
  readonly generated: string;
  readonly generatedIndex: string;
  readonly vectors: string;
  readonly assetGraph: string;
  readonly searchIndex: string;
}

/** Project-local editable/runtime roots (`.neko/` plus explicit `.agents/skills`). */
export interface IProjectLocalLayout {
  readonly root: string;
  readonly workspaceIdentity: string;
  readonly settingsLocal: string;
  readonly memory: string;
  readonly skills: string;
  readonly commands: string;
  readonly prompts: string;
  readonly agentsMd: string;
  readonly config: string;
  readonly processors: string;
  readonly cache: ICacheLayout;
}

export interface IProjectStorageLayout {
  readonly facts: IProjectFactsLayout;
  readonly local: IProjectLocalLayout;
}

export interface IStorageLayout {
  readonly global: IGlobalStorageLayout;
  readonly project: IProjectStorageLayout;
}

export function resolveGlobalStorageLayout(homedir: string): IGlobalStorageLayout {
  const root = join(homedir, '.neko');
  return {
    root,
    database: join(root, 'neko.db'),
    journals: join(root, 'journals'),
    logs: join(root, 'logs'),
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
  const localRoot = join(workspaceRoot, '.neko');
  const cacheRoot = join(localRoot, '.cache');

  const facts: IProjectFactsLayout = {
    root: factsRoot,
    settings: join(factsRoot, 'settings.json'),
    assetLibrary: join(factsRoot, 'assets', 'library.json'),
    providerCards: join(factsRoot, 'providers'),
    entityBindings: join(factsRoot, 'entity-bindings.json'),
    visualIdentityDrafts: join(factsRoot, 'visual-identity-drafts.json'),
    entityAssetRequirements: join(factsRoot, 'entity-asset-requirements.json'),
  };

  const cache: ICacheLayout = {
    root: cacheRoot,
    mediaMetadata: join(cacheRoot, 'media-metadata.json'),
    thumbnails: join(cacheRoot, 'thumbnails'),
    resources: join(cacheRoot, 'resources'),
    resourceManifest: join(cacheRoot, 'resources', 'manifest.json'),
    proxies: join(cacheRoot, 'proxies'),
    proxyManifest: join(cacheRoot, 'proxies', 'manifest.json'),
    generated: join(cacheRoot, 'generated'),
    generatedIndex: join(cacheRoot, 'generated', 'index.json'),
    vectors: join(cacheRoot, 'vectors'),
    assetGraph: join(cacheRoot, 'asset-graph.json'),
    searchIndex: join(cacheRoot, 'search-index.json'),
  };

  return {
    global: resolveGlobalStorageLayout(homedir),
    project: {
      facts,
      local: {
        root: localRoot,
        workspaceIdentity: join(localRoot, 'workspace.json'),
        settingsLocal: join(localRoot, 'settings.local.json'),
        memory: join(localRoot, 'memory.md'),
        skills: join(workspaceRoot, '.agents', 'skills'),
        commands: join(localRoot, 'commands'),
        prompts: join(localRoot, 'prompts'),
        agentsMd: join(localRoot, 'AGENTS.md'),
        config: join(localRoot, 'config.toml'),
        processors: join(localRoot, 'processors'),
        cache,
      },
    },
  };
}

export function assertCanonicalMetadataDatabasePath(path: string, homedir: string): void {
  const canonicalPath = resolveGlobalStorageLayout(homedir).database;
  if (path === canonicalPath) return;
  throw new NekoStorageContractError({
    code: 'retired-workspace-database',
    message: `SQLite metadata must use ${canonicalPath}; refused retired or package-local path ${path}`,
  });
}

export const WORKSPACE_IDENTITY_VERSION = 1;
export const WORKSPACE_IDENTITY_RELATIVE_PATH = '.neko/workspace.json';

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
  readonly version: typeof WORKSPACE_IDENTITY_VERSION;
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

export type WorkspaceIdentityAction =
  | {
      readonly kind: 'clone';
      readonly sourceWorkspaceId: string;
      readonly newWorkspaceId: string;
      readonly locator: WorkspacePortableLocator;
    }
  | {
      readonly kind: 'rebind';
      readonly workspaceId: string;
      readonly locator: WorkspacePortableLocator;
    }
  | {
      readonly kind: 'select-current';
      readonly workspaceId: string;
      readonly conflictingWorkspaceIds: readonly string[];
      readonly locator: WorkspacePortableLocator;
    };

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
  if (value.version !== WORKSPACE_IDENTITY_VERSION) {
    throw new NekoStorageContractError({
      code: 'workspace-identity-version-mismatch',
      message: `Unsupported workspace identity version: ${String(value.version)}`,
    });
  }
  if (!isWorkspaceId(value.workspaceId)) {
    throw new NekoStorageContractError({
      code: 'invalid-workspace-identity',
      message: 'Workspace identity workspaceId must be a valid UUID',
    });
  }
  return { version: WORKSPACE_IDENTITY_VERSION, workspaceId: value.workspaceId };
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
    version: WORKSPACE_IDENTITY_VERSION,
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
