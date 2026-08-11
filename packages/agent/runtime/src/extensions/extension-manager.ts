import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import type {
  AgentExtensionCatalogItem,
  AgentExtensionCatalogSnapshot,
  AgentExtensionDiagnosticCode,
  AgentExtensionRuntimeDescriptor,
  AgentExtensionRuntimeReadiness,
  AgentExtensionStatus,
} from '@neko/agent-contracts';
import { createPluginRuntimeSourceFingerprint } from './plugin-runtime-source-fingerprint';

export type {
  AgentExtensionCatalogSnapshot,
  AgentExtensionRuntimeDescriptor,
  AgentExtensionRuntimeReadiness,
} from '@neko/agent-contracts';

const OPENNEKO_MARKETPLACE_ID = 'openneko';
const OPENNEKO_MARKETPLACE_PUBLISHER = 'OpenNeko';
const MAX_PLUGIN_DOCUMENT_BYTES = 1_000_000;
const MAX_ICON_BYTES = 512_000;
export interface AgentExtensionSupportPort {
  isSupported(descriptor: AgentExtensionRuntimeDescriptor): Promise<boolean>;
}

export type AgentExtensionRuntimeMutation = 'enable' | 'disable' | 'remove';

export interface AgentExtensionMutationOwnershipPort {
  assertIdle(input: {
    readonly operationId: string;
    readonly pluginId: string;
    readonly mutation: AgentExtensionRuntimeMutation;
  }): Promise<void>;
}

export function createAgentExtensionMutationOwnership(options: {
  readonly listOwnedAgentTurns: (pluginId: string) => readonly { readonly runId: string }[];
  readonly listOwnedAutomationSessions: (
    pluginId: string,
  ) => readonly { readonly sessionId: string }[];
}): AgentExtensionMutationOwnershipPort {
  return {
    async assertIdle({ pluginId, mutation }) {
      const turns = options.listOwnedAgentTurns(pluginId);
      if (turns.length > 0) {
        throw new Error(
          `OpenNeko extension '${pluginId}' cannot ${mutation} while it owns ${turns.length} Agent turn(s).`,
        );
      }
      const sessions = options.listOwnedAutomationSessions(pluginId);
      if (sessions.length > 0) {
        throw new Error(
          `OpenNeko extension '${pluginId}' cannot ${mutation} while it owns ${sessions.length} Automation session(s).`,
        );
      }
    },
  };
}

export interface AgentExtensionManager {
  readCatalog(): Promise<AgentExtensionCatalogSnapshot>;
  enablePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot>;
  disablePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot>;
  removePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot>;
  rescanSources(): Promise<AgentExtensionCatalogSnapshot>;
  setRuntimeReadiness(
    source: AgentExtensionCatalogSnapshot,
    readiness: ReadonlyMap<string, AgentExtensionRuntimeReadiness>,
  ): void;
}

interface AgentExtensionRepositorySnapshot {
  readonly entries: readonly RepositoryPluginEntry[];
  readonly diagnostics: readonly AgentExtensionDiagnosticCode[];
}

export interface AgentExtensionRepositoryPort {
  read(): Promise<AgentExtensionRepositorySnapshot>;
  enable(pluginId: string, operationId: string): Promise<void>;
  disable(pluginId: string, operationId: string): Promise<void>;
  remove(pluginId: string, operationId: string): Promise<void>;
  reload(): Promise<void>;
}

export function createOpenNekoExtensionRepository(options: {
  readonly marketplaceRoot: string;
  readonly installRoot: string;
  readonly stateRoot: string;
  readonly trashItem: (absolutePath: string) => Promise<void>;
}): AgentExtensionRepositoryPort {
  const marketplaceRoot = requireAbsoluteRoot(options.marketplaceRoot, 'marketplace');
  const installRoot = requireAbsoluteRoot(options.installRoot, 'install');
  const stateRoot = requireAbsoluteRoot(options.stateRoot, 'state');
  assertSeparateRoots([marketplaceRoot, installRoot, stateRoot]);
  return new OpenNekoExtensionRepository(
    marketplaceRoot,
    installRoot,
    stateRoot,
    options.trashItem,
  );
}

export function createAgentExtensionManager(options: {
  readonly repository: AgentExtensionRepositoryPort;
  readonly agentSupport: AgentExtensionSupportPort;
  readonly mutationOwnership: AgentExtensionMutationOwnershipPort;
}): AgentExtensionManager {
  return new DefaultAgentExtensionManager(
    options.repository,
    options.agentSupport,
    options.mutationOwnership,
  );
}

class DefaultAgentExtensionManager implements AgentExtensionManager {
  private runtimeSourceFingerprint: string | undefined;
  private runtimeReadiness = new Map<string, AgentExtensionRuntimeReadiness>();
  private mutationTail = Promise.resolve();

  constructor(
    private readonly repository: AgentExtensionRepositoryPort,
    private readonly agentSupport: AgentExtensionSupportPort,
    private readonly mutationOwnership: AgentExtensionMutationOwnershipPort,
  ) {}

  async readCatalog(): Promise<AgentExtensionCatalogSnapshot> {
    let repositorySnapshot: AgentExtensionRepositorySnapshot;
    try {
      repositorySnapshot = await this.repository.read();
    } catch {
      return createSnapshot([], [], ['repository_failed']);
    }

    const visiblePlugins: VerifiedPlugin[] = [];
    const invalidInstalledPlugins: Array<{
      readonly entry: RepositoryPluginEntry;
      readonly code: AgentExtensionDiagnosticCode;
    }> = [];
    const runtimeDescriptors: AgentExtensionRuntimeDescriptor[] = [];
    const diagnosticCodes = [...repositorySnapshot.diagnostics];
    for (const entry of repositorySnapshot.entries) {
      const plugin = await readPluginPackage(entry);
      if (plugin.status === 'error') {
        diagnosticCodes.push(plugin.code);
        invalidInstalledPlugins.push({ entry, code: plugin.code });
        continue;
      }
      const verifiedPlugin = plugin.value;
      if (
        entry.deliverySource === 'personal' ||
        entry.listed ||
        (await this.agentSupport.isSupported(verifiedPlugin.runtime))
      ) {
        visiblePlugins.push(verifiedPlugin);
      }
      if (verifiedPlugin.entry.enabled) {
        runtimeDescriptors.push(verifiedPlugin.runtime);
      }
    }
    let records = [
      ...visiblePlugins.map((plugin) => projectExtension(plugin, undefined)),
      ...invalidInstalledPlugins.map(({ entry, code }) => projectInvalidExtension(entry, code)),
    ];
    records.sort(compareExtensionRecords);
    runtimeDescriptors.sort((left, right) => left.pluginId.localeCompare(right.pluginId));
    const sourceFingerprint = createPluginRuntimeSourceFingerprint(
      createSnapshot(records, runtimeDescriptors, diagnosticCodes),
    );
    if (this.runtimeSourceFingerprint === sourceFingerprint) {
      records = [
        ...visiblePlugins.map((plugin) =>
          projectExtension(plugin, this.runtimeReadiness.get(plugin.entry.pluginId)),
        ),
        ...invalidInstalledPlugins.map(({ entry, code }) => projectInvalidExtension(entry, code)),
      ];
      records.sort(compareExtensionRecords);
    }
    return createSnapshot(records, runtimeDescriptors, diagnosticCodes);
  }

  async enablePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot> {
    const id = requireOpenNekoPluginId(pluginId);
    const operationId = randomUUID();
    return this.serializeMutation(() =>
      this.mutate(
        id,
        (record) => record.canEnable,
        async () => {
          await this.mutationOwnership.assertIdle({
            operationId,
            pluginId: id,
            mutation: 'enable',
          });
          await this.repository.enable(id, operationId);
        },
      ),
    );
  }

  async disablePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot> {
    const id = requireOpenNekoPluginId(pluginId);
    const operationId = randomUUID();
    return this.serializeMutation(() =>
      this.mutate(
        id,
        (record) => record.canDisable,
        async () => {
          await this.mutationOwnership.assertIdle({
            operationId,
            pluginId: id,
            mutation: 'disable',
          });
          await this.repository.disable(id, operationId);
        },
      ),
    );
  }

  async removePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot> {
    const id = requireOpenNekoPluginId(pluginId);
    const operationId = randomUUID();
    return this.serializeMutation(() =>
      this.mutate(
        id,
        (record) => record.canRemove,
        async () => {
          await this.mutationOwnership.assertIdle({
            operationId,
            pluginId: id,
            mutation: 'remove',
          });
          await this.repository.remove(id, operationId);
        },
      ),
    );
  }

  async rescanSources(): Promise<AgentExtensionCatalogSnapshot> {
    return this.serializeMutation(async () => {
      await this.repository.reload();
      this.clearRuntimeReadiness();
      return this.readCatalog();
    });
  }

  setRuntimeReadiness(
    source: AgentExtensionCatalogSnapshot,
    readiness: ReadonlyMap<string, AgentExtensionRuntimeReadiness>,
  ): void {
    this.runtimeSourceFingerprint = createPluginRuntimeSourceFingerprint(source);
    this.runtimeReadiness = new Map(readiness);
  }

  private async mutate(
    pluginId: string,
    allowed: (record: AgentExtensionCatalogItem) => boolean,
    operation: (record: AgentExtensionCatalogItem) => Promise<void>,
  ): Promise<AgentExtensionCatalogSnapshot> {
    const before = await this.readCatalog();
    const record = before.records.find((item) => item.id === pluginId);
    if (!record || !allowed(record)) {
      throw new Error(`OpenNeko extension '${pluginId}' does not allow this operation.`);
    }
    await operation(record);
    this.clearRuntimeReadiness();
    return this.readCatalog();
  }

  private clearRuntimeReadiness(): void {
    this.runtimeSourceFingerprint = undefined;
    this.runtimeReadiness.clear();
  }

  private async serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release!: () => void;
    this.mutationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

class OpenNekoExtensionRepository implements AgentExtensionRepositoryPort {
  constructor(
    private readonly marketplaceRoot: string,
    private readonly installRoot: string,
    private readonly stateRoot: string,
    private readonly trashItem: (absolutePath: string) => Promise<void>,
  ) {}

  async read(): Promise<AgentExtensionRepositorySnapshot> {
    const [marketplace, personal] = await Promise.all([
      readMarketplaceEntries(this.marketplaceRoot, this.stateRoot),
      readInstalledEntries(this.installRoot, this.stateRoot),
    ]);
    const entries = new Map<string, RepositoryPluginEntry>();
    const mergeDiagnostics: AgentExtensionDiagnosticCode[] = [];
    for (const entry of personal.entries) entries.set(entry.pluginId, entry);
    for (const entry of marketplace.entries) {
      if (entries.has(entry.pluginId)) {
        entries.delete(entry.pluginId);
        mergeDiagnostics.push('repository_invalid');
      } else {
        entries.set(entry.pluginId, entry);
      }
    }
    return Object.freeze({
      entries: Object.freeze(
        [...entries.values()].sort((left, right) => left.pluginId.localeCompare(right.pluginId)),
      ),
      diagnostics: Object.freeze([
        ...marketplace.diagnostics,
        ...personal.diagnostics,
        ...mergeDiagnostics,
      ]),
    });
  }

  async enable(pluginId: string, _operationId: string): Promise<void> {
    const name = pluginNameFromId(pluginId);
    const snapshot = await this.read();
    const repositoryEntry = snapshot.entries.find((entry) => entry.pluginId === pluginId);
    if (!repositoryEntry) {
      throw new Error(`OpenNeko extension '${pluginId}' is unavailable.`);
    }
    const verified = await readPluginPackage(repositoryEntry);
    if (verified.status === 'error') {
      throw new Error(`OpenNeko extension '${pluginId}' package is invalid.`);
    }
    await writeExtensionGrant(this.stateRoot, name, pluginId, true);
  }

  async disable(pluginId: string, _operationId: string): Promise<void> {
    const name = pluginNameFromId(pluginId);
    const grant = await readExtensionGrant(this.stateRoot, name);
    if (grant.diagnostic !== undefined) {
      throw new Error(`OpenNeko extension '${pluginId}' enable grant is invalid.`);
    }
    await writeExtensionGrant(this.stateRoot, name, pluginId, false);
  }

  async remove(pluginId: string, _operationId: string): Promise<void> {
    const name = pluginNameFromId(pluginId);
    const target = resolve(this.installRoot, name);
    let canonicalRoot: string;
    let canonicalTarget: string;
    let info;
    try {
      [canonicalRoot, canonicalTarget, info] = await Promise.all([
        realpath(this.installRoot),
        realpath(target),
        lstat(target),
      ]);
    } catch {
      throw new Error(`OpenNeko extension '${pluginId}' is unavailable.`);
    }
    if (
      !isInsideOrEqual(canonicalRoot, canonicalTarget) ||
      !info.isDirectory() ||
      info.isSymbolicLink()
    ) {
      throw new Error(`OpenNeko extension '${pluginId}' install is invalid.`);
    }
    const identity = await readPluginIdentity(canonicalTarget);
    if (!identity || identity.name !== name) {
      throw new Error(`OpenNeko extension '${pluginId}' install is invalid.`);
    }
    await this.trashItem(canonicalTarget);
    await rm(extensionGrantPath(this.stateRoot, name), { force: true });
  }

  async reload(): Promise<void> {
    await this.read();
  }
}

interface RepositoryPluginEntry {
  readonly pluginId: string;
  readonly name: string;
  readonly marketplace: typeof OPENNEKO_MARKETPLACE_ID;
  readonly version: string;
  readonly enabled: boolean;
  readonly authorityRoot: string;
  readonly sourcePath: string;
  readonly canRemove: boolean;
  readonly listed: boolean;
  readonly deliverySource: AgentExtensionCatalogItem['deliverySource'];
  readonly grantDiagnostic?: AgentExtensionDiagnosticCode;
}

interface VerifiedPlugin {
  readonly entry: RepositoryPluginEntry;
  readonly displayName: string;
  readonly description: string;
  readonly localization: AgentExtensionCatalogItem['localization'];
  readonly developer: string;
  readonly category: string;
  readonly iconDataUrl: string;
  readonly runtime: AgentExtensionRuntimeDescriptor;
}

type ReadResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'error'; readonly code: AgentExtensionDiagnosticCode };

async function readMarketplaceEntries(
  marketplaceRoot: string,
  stateRoot: string,
): Promise<AgentExtensionRepositorySnapshot> {
  const indexResult = await readJsonFile(
    resolve(marketplaceRoot, 'marketplace.json'),
    marketplaceRoot,
  );
  if (indexResult.status === 'missing') {
    return { entries: [], diagnostics: ['repository_unavailable'] };
  }
  if (indexResult.status === 'error') {
    return { entries: [], diagnostics: ['repository_invalid'] };
  }
  const definitions = parseMarketplaceIndex(indexResult.value);
  if (!definitions) return { entries: [], diagnostics: ['repository_invalid'] };
  return {
    entries: await Promise.all(
      definitions.map(async (definition) => {
        const grant = await readExtensionGrant(stateRoot, definition.name);
        return createRepositoryEntry({
          name: definition.name,
          version: definition.version,
          authorityRoot: marketplaceRoot,
          sourcePath: resolve(marketplaceRoot, definition.path),
          enabled: grant.enabled,
          listed: true,
          deliverySource: 'bundled',
          canRemove: false,
          ...(grant.diagnostic === undefined ? {} : { grantDiagnostic: grant.diagnostic }),
        });
      }),
    ),
    diagnostics: [],
  };
}

async function readInstalledEntries(
  installRoot: string,
  stateRoot: string,
): Promise<AgentExtensionRepositorySnapshot> {
  let children;
  try {
    children = await readdir(installRoot, { withFileTypes: true });
  } catch (error) {
    return isEnoent(error)
      ? { entries: [], diagnostics: [] }
      : { entries: [], diagnostics: ['repository_failed'] };
  }
  const entries: RepositoryPluginEntry[] = [];
  const diagnostics: AgentExtensionDiagnosticCode[] = [];
  for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
    if (
      child.name.startsWith('.') ||
      !isPluginSegment(child.name) ||
      !child.isDirectory() ||
      child.isSymbolicLink()
    ) {
      diagnostics.push('manifest_invalid');
      continue;
    }
    const pluginRoot = resolve(installRoot, child.name);
    const identity = await readPluginIdentity(pluginRoot);
    if (!identity || identity.name !== child.name) {
      const grant = await readExtensionGrant(stateRoot, child.name);
      if (grant.diagnostic) diagnostics.push(grant.diagnostic);
      entries.push(
        createRepositoryEntry({
          name: child.name,
          version: identity?.version ?? '',
          authorityRoot: installRoot,
          sourcePath: pluginRoot,
          enabled: grant.enabled,
          deliverySource: 'personal',
          ...(grant.diagnostic === undefined ? {} : { grantDiagnostic: grant.diagnostic }),
        }),
      );
      continue;
    }
    const grant = await readExtensionGrant(stateRoot, identity.name);
    if (grant.diagnostic) diagnostics.push(grant.diagnostic);
    entries.push(
      createRepositoryEntry({
        name: identity.name,
        version: identity.version,
        authorityRoot: installRoot,
        sourcePath: pluginRoot,
        enabled: grant.enabled,
        deliverySource: 'personal',
        ...(grant.diagnostic === undefined ? {} : { grantDiagnostic: grant.diagnostic }),
      }),
    );
  }
  return { entries, diagnostics };
}

async function writeExtensionGrant(
  stateRoot: string,
  name: string,
  pluginId: string,
  enabled: boolean,
): Promise<void> {
  await mkdir(stateRoot, { recursive: true });
  const grantPath = extensionGrantPath(stateRoot, name);
  const staging = `${grantPath}.staging-${randomUUID()}`;
  try {
    await writeFile(
      staging,
      JSON.stringify({
        pluginId,
        enabled,
      }),
      { encoding: 'utf8', flag: 'wx' },
    );
    await rename(staging, grantPath);
  } finally {
    await rm(staging, { force: true });
  }
}

async function readExtensionGrant(
  stateRoot: string,
  name: string,
): Promise<{
  readonly enabled: boolean;
  readonly diagnostic?: AgentExtensionDiagnosticCode;
}> {
  const pluginId = `${name}@${OPENNEKO_MARKETPLACE_ID}`;
  const result = await readJsonFile(extensionGrantPath(stateRoot, name), stateRoot);
  if (result.status === 'missing') {
    return { enabled: false };
  }
  if (
    result.status === 'error' ||
    !hasOnlyKeys(result.value, ['pluginId', 'enabled']) ||
    typeof result.value['enabled'] !== 'boolean' ||
    result.value['pluginId'] !== pluginId
  ) {
    return { enabled: false, diagnostic: 'state_invalid' };
  }
  return { enabled: result.value['enabled'] };
}

function parseMarketplaceIndex(value: Record<string, unknown>):
  | readonly {
      readonly name: string;
      readonly version: string;
      readonly path: string;
    }[]
  | undefined {
  if (
    !hasOnlyKeys(value, ['publisher', 'plugins']) ||
    value['publisher'] !== OPENNEKO_MARKETPLACE_PUBLISHER ||
    !Array.isArray(value['plugins'])
  ) {
    return undefined;
  }
  const records: {
    name: string;
    version: string;
    path: string;
  }[] = [];
  const ids = new Set<string>();
  for (const item of value['plugins']) {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, ['name', 'version', 'path']) ||
      !isPluginSegmentValue(item['name']) ||
      !isNonEmptyString(item['version']) ||
      !isNonEmptyString(item['path']) ||
      isAbsolute(item['path'])
    ) {
      return undefined;
    }
    const sourcePath = relative('.', item['path']);
    if (
      sourcePath === '.' ||
      sourcePath.startsWith('..') ||
      isAbsolute(sourcePath) ||
      ids.has(item['name'])
    ) {
      return undefined;
    }
    ids.add(item['name']);
    records.push({
      name: item['name'],
      version: item['version'],
      path: item['path'],
    });
  }
  records.sort((left, right) => left.name.localeCompare(right.name));
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

function createRepositoryEntry(input: {
  readonly name: string;
  readonly version: string;
  readonly authorityRoot: string;
  readonly sourcePath: string;
  readonly enabled?: boolean;
  readonly listed?: boolean;
  readonly canRemove?: boolean;
  readonly deliverySource: AgentExtensionCatalogItem['deliverySource'];
  readonly grantDiagnostic?: AgentExtensionDiagnosticCode;
}): RepositoryPluginEntry {
  return Object.freeze({
    pluginId: `${input.name}@${OPENNEKO_MARKETPLACE_ID}`,
    name: input.name,
    marketplace: OPENNEKO_MARKETPLACE_ID,
    version: input.version,
    enabled: input.enabled ?? false,
    authorityRoot: resolve(input.authorityRoot),
    sourcePath: resolve(input.sourcePath),
    canRemove: input.canRemove ?? input.enabled !== true,
    listed: input.listed ?? false,
    deliverySource: input.deliverySource,
    ...(input.grantDiagnostic === undefined ? {} : { grantDiagnostic: input.grantDiagnostic }),
  });
}

async function readPluginIdentity(
  pluginRoot: string,
): Promise<{ readonly name: string; readonly version: string } | undefined> {
  const manifest = await readJsonRecord(
    resolve(pluginRoot, '.openneko-plugin', 'plugin.json'),
    pluginRoot,
    'manifest_invalid',
  );
  if (
    manifest.status === 'error' ||
    !isPluginSegmentValue(manifest.value['name']) ||
    !isNonEmptyString(manifest.value['version'])
  ) {
    return undefined;
  }
  return Object.freeze({
    name: manifest.value['name'],
    version: manifest.value['version'],
  });
}

async function readPluginPackage(
  entry: RepositoryPluginEntry,
): Promise<ReadResult<VerifiedPlugin>> {
  let pluginRoot: string;
  try {
    const [canonicalAuthorityRoot, canonicalRoot, info] = await Promise.all([
      realpath(entry.authorityRoot),
      realpath(entry.sourcePath),
      lstat(entry.sourcePath),
    ]);
    if (
      !isInsideOrEqual(canonicalAuthorityRoot, canonicalRoot) ||
      !info.isDirectory() ||
      info.isSymbolicLink()
    ) {
      return { status: 'error', code: 'manifest_invalid' };
    }
    pluginRoot = canonicalRoot;
  } catch {
    return { status: 'error', code: 'manifest_invalid' };
  }
  const manifestResult = await readJsonRecord(
    resolve(pluginRoot, '.openneko-plugin', 'plugin.json'),
    pluginRoot,
    'manifest_invalid',
  );
  if (manifestResult.status === 'error') return manifestResult;
  const manifest = manifestResult.value;
  if (
    manifest['name'] !== entry.name ||
    manifest['version'] !== entry.version ||
    !isOptionalString(manifest['description'])
  ) {
    return { status: 'error', code: 'manifest_invalid' };
  }
  const interfaceMetadata = optionalRecord(manifest['interface']);
  const localization = parsePluginInterfaceLocalization(interfaceMetadata?.['localization']);
  const author = optionalRecord(manifest['author']);
  const mcpToolExposure = manifest['mcpToolExposure'];
  if (
    interfaceMetadata === null ||
    localization === null ||
    author === null ||
    (mcpToolExposure !== undefined && mcpToolExposure !== 'adapter-only') ||
    !isOptionalString(interfaceMetadata?.['displayName']) ||
    !isOptionalString(interfaceMetadata?.['shortDescription']) ||
    !isOptionalString(interfaceMetadata?.['developerName']) ||
    !isOptionalString(interfaceMetadata?.['category']) ||
    !isOptionalString(interfaceMetadata?.['logo']) ||
    !isOptionalString(author?.['name'])
  ) {
    return { status: 'error', code: 'manifest_invalid' };
  }

  const mcp = await readContributionDocument(manifest['mcpServers'], pluginRoot, 'mcpServers');
  if (mcp.status === 'error') return mcp;
  const apps = await readContributionDocument(manifest['apps'], pluginRoot, 'apps');
  if (apps.status === 'error') return apps;
  const skills = await readSkillRoot(manifest['skills'], pluginRoot);
  if (skills.status === 'error') return skills;
  const icon = await readIcon(interfaceMetadata?.['logo'], pluginRoot);
  if (icon.status === 'error') return icon;

  return {
    status: 'ok',
    value: Object.freeze({
      entry,
      displayName: interfaceMetadata?.['displayName'] ?? entry.name,
      description: interfaceMetadata?.['shortDescription'] ?? manifest['description'] ?? '',
      localization: localization ?? Object.freeze({}),
      developer: interfaceMetadata?.['developerName'] ?? author?.['name'] ?? '',
      category: interfaceMetadata?.['category'] ?? '',
      iconDataUrl: icon.value,
      runtime: Object.freeze({
        pluginId: entry.pluginId,
        pluginRoot,
        ...(skills.value === undefined ? {} : { skillRoot: skills.value }),
        ...(mcp.value.path === undefined ? {} : { mcpDocumentPath: mcp.value.path }),
        mcpServerIds: mcp.value.ids,
        ...(mcpToolExposure === undefined ? {} : { mcpToolExposure }),
        appIds: apps.value.ids,
      }),
    }),
  };
}

function projectExtension(
  plugin: VerifiedPlugin,
  readiness: AgentExtensionRuntimeReadiness | undefined,
): AgentExtensionCatalogItem {
  const { entry, runtime } = plugin;
  let agentStatus: AgentExtensionStatus;
  let runtimeDiagnosticCode: string;
  if (entry.grantDiagnostic) {
    agentStatus = 'error';
    runtimeDiagnosticCode = entry.grantDiagnostic.replaceAll('_', '-');
  } else if (!entry.enabled) {
    agentStatus = 'disabled';
    runtimeDiagnosticCode = '';
  } else if (readiness) {
    agentStatus = readiness.status;
    runtimeDiagnosticCode = readiness.diagnosticCode;
  } else if (runtime.appIds.length > 0 && !runtime.skillRoot && runtime.mcpServerIds.length === 0) {
    agentStatus = 'unsupported';
    runtimeDiagnosticCode = 'app-unsupported';
  } else if (!runtime.skillRoot && runtime.mcpServerIds.length === 0) {
    agentStatus = 'unsupported';
    runtimeDiagnosticCode = 'no-agent-contribution';
  } else {
    agentStatus = 'error';
    runtimeDiagnosticCode = 'runtime-not-composed';
  }
  return Object.freeze({
    id: entry.pluginId,
    name: entry.name,
    displayName: plugin.displayName,
    description: plugin.description,
    localization: plugin.localization,
    version: entry.version,
    developer: plugin.developer,
    marketplace: entry.marketplace,
    category: plugin.category,
    enabled: entry.enabled,
    canEnable: !entry.enabled,
    canDisable: entry.enabled,
    canRemove: entry.canRemove,
    deliverySource: entry.deliverySource,
    agentStatus,
    runtimeDiagnosticCode,
    iconDataUrl: plugin.iconDataUrl,
    mcpServerIds: runtime.mcpServerIds,
    hasSkills: runtime.skillRoot !== undefined,
    appIds: runtime.appIds,
  });
}

function projectInvalidExtension(
  entry: RepositoryPluginEntry,
  code: AgentExtensionDiagnosticCode,
): AgentExtensionCatalogItem {
  return Object.freeze({
    id: entry.pluginId,
    name: entry.name,
    displayName: entry.name,
    description: '',
    localization: Object.freeze({}),
    version: entry.version,
    developer: '',
    marketplace: entry.marketplace,
    category: '',
    enabled: entry.enabled,
    canEnable: false,
    canDisable: entry.enabled,
    canRemove: entry.canRemove,
    deliverySource: entry.deliverySource,
    agentStatus: 'error',
    runtimeDiagnosticCode: code.replaceAll('_', '-'),
    iconDataUrl: '',
    mcpServerIds: [],
    hasSkills: false,
    appIds: [],
  });
}

async function readContributionDocument(
  locator: unknown,
  pluginRoot: string,
  key: 'mcpServers' | 'apps',
): Promise<ReadResult<{ readonly path?: string; readonly ids: readonly string[] }>> {
  if (locator === undefined || locator === null) {
    return { status: 'ok', value: { ids: [] } };
  }
  if (!isNonEmptyString(locator)) return { status: 'error', code: 'contribution_invalid' };
  const documentPath = resolvePackagePath(pluginRoot, locator);
  if (!documentPath) return { status: 'error', code: 'contribution_invalid' };
  const document = await readJsonRecord(documentPath, pluginRoot, 'contribution_invalid');
  if (document.status === 'error') return document;
  const contributions = document.value[key];
  if (!isRecord(contributions)) return { status: 'error', code: 'contribution_invalid' };
  const ids = Object.keys(contributions).sort();
  if (
    ids.some((id) => !isExtensionIdentifier(id)) ||
    Object.values(contributions).some((item) => !isRecord(item))
  ) {
    return { status: 'error', code: 'contribution_invalid' };
  }
  return {
    status: 'ok',
    value: Object.freeze({
      path: documentPath,
      ids: Object.freeze(ids),
    }),
  };
}

async function readSkillRoot(
  locator: unknown,
  pluginRoot: string,
): Promise<ReadResult<string | undefined>> {
  if (locator === undefined || locator === null) return { status: 'ok', value: undefined };
  if (!isNonEmptyString(locator)) return { status: 'error', code: 'contribution_invalid' };
  const skillRoot = resolvePackagePath(pluginRoot, locator);
  if (!skillRoot) return { status: 'error', code: 'contribution_invalid' };
  try {
    const [canonicalRoot, canonicalSkillRoot, info] = await Promise.all([
      realpath(pluginRoot),
      realpath(skillRoot),
      lstat(skillRoot),
    ]);
    if (
      !isInsideOrEqual(canonicalRoot, canonicalSkillRoot) ||
      !info.isDirectory() ||
      info.isSymbolicLink()
    ) {
      return { status: 'error', code: 'contribution_invalid' };
    }
    return { status: 'ok', value: canonicalSkillRoot };
  } catch {
    return { status: 'error', code: 'contribution_invalid' };
  }
}

async function readIcon(locator: unknown, pluginRoot: string): Promise<ReadResult<string>> {
  if (locator === undefined || locator === null) return { status: 'ok', value: '' };
  if (!isNonEmptyString(locator)) return { status: 'error', code: 'manifest_invalid' };
  const iconPath = resolvePackagePath(pluginRoot, locator);
  if (!iconPath) return { status: 'error', code: 'manifest_invalid' };
  const extension = /\.(png|jpe?g|webp|gif|svg)$/iu.exec(iconPath)?.[1]?.toLowerCase();
  if (!extension) return { status: 'error', code: 'manifest_invalid' };
  try {
    const [canonicalRoot, canonicalIcon, info] = await Promise.all([
      realpath(pluginRoot),
      realpath(iconPath),
      lstat(iconPath),
    ]);
    if (!isInsideOrEqual(canonicalRoot, canonicalIcon) || !info.isFile() || info.isSymbolicLink()) {
      return { status: 'error', code: 'manifest_invalid' };
    }
    if (info.size > MAX_ICON_BYTES) return { status: 'ok', value: '' };
    const data = await readFile(canonicalIcon);
    const mediaType =
      extension === 'jpg' || extension === 'jpeg'
        ? 'jpeg'
        : extension === 'svg'
          ? 'svg+xml'
          : extension;
    return {
      status: 'ok',
      value: `data:image/${mediaType};base64,${data.toString('base64')}`,
    };
  } catch {
    return { status: 'error', code: 'manifest_invalid' };
  }
}

async function readJsonRecord(
  filePath: string,
  root: string,
  code: AgentExtensionDiagnosticCode,
): Promise<ReadResult<Record<string, unknown>>> {
  const result = await readJsonFile(filePath, root);
  return result.status === 'ok' ? result : { status: 'error', code };
}

async function readJsonFile(
  filePath: string,
  root: string,
): Promise<
  | { readonly status: 'ok'; readonly value: Record<string, unknown> }
  | { readonly status: 'missing' }
  | { readonly status: 'error' }
> {
  if (!isInsideOrEqual(root, filePath)) return { status: 'error' };
  try {
    const [canonicalRoot, canonicalFile, info] = await Promise.all([
      realpath(root),
      realpath(filePath),
      lstat(filePath),
    ]);
    if (
      !isInsideOrEqual(canonicalRoot, canonicalFile) ||
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > MAX_PLUGIN_DOCUMENT_BYTES
    ) {
      return { status: 'error' };
    }
    const source = await readFile(canonicalFile, 'utf8');
    const parsed: unknown = JSON.parse(source);
    return isRecord(parsed) ? { status: 'ok', value: parsed } : { status: 'error' };
  } catch (error) {
    return isEnoent(error) ? { status: 'missing' } : { status: 'error' };
  }
}

function createSnapshot(
  records: readonly AgentExtensionCatalogItem[],
  runtimeDescriptors: readonly AgentExtensionRuntimeDescriptor[],
  diagnosticCodes: readonly AgentExtensionDiagnosticCode[],
): AgentExtensionCatalogSnapshot {
  const counts = new Map<AgentExtensionDiagnosticCode, number>();
  for (const code of diagnosticCodes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return Object.freeze({
    records: Object.freeze([...records]),
    runtimeDescriptors: Object.freeze([...runtimeDescriptors]),
    diagnostics: Object.freeze(
      [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, count]) => Object.freeze({ code, count })),
    ),
  });
}

function compareExtensionRecords(
  left: AgentExtensionCatalogItem,
  right: AgentExtensionCatalogItem,
): number {
  return left.id.localeCompare(right.id);
}

function resolvePackagePath(pluginRoot: string, locator: string): string | undefined {
  if (isAbsolute(locator)) return undefined;
  const path = resolve(pluginRoot, locator);
  return isInsideOrEqual(pluginRoot, path) ? path : undefined;
}

function isInsideOrEqual(root: string, target: string): boolean {
  const pathFromRoot = relative(resolve(root), resolve(target));
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

function requireOpenNekoPluginId(value: string): string {
  const separator = value.lastIndexOf('@');
  if (
    separator <= 0 ||
    separator === value.length - 1 ||
    !isPluginSegment(value.slice(0, separator)) ||
    value.slice(separator + 1) !== OPENNEKO_MARKETPLACE_ID
  ) {
    throw new Error('Desktop OpenNeko plugin id is invalid.');
  }
  return value;
}

function pluginNameFromId(pluginId: string): string {
  return requireOpenNekoPluginId(pluginId).slice(0, -`@${OPENNEKO_MARKETPLACE_ID}`.length);
}

function requireAbsoluteRoot(value: string, name: string): string {
  if (!isAbsolute(value)) throw new Error(`OpenNeko extension ${name} root must be absolute.`);
  return resolve(value);
}

function assertSeparateRoots(roots: readonly string[]): void {
  for (const [index, root] of roots.entries()) {
    for (const other of roots.slice(index + 1)) {
      if (isInsideOrEqual(root, other) || isInsideOrEqual(other, root)) {
        throw new Error(
          'OpenNeko extension marketplace, install and state roots must be separate.',
        );
      }
    }
  }
}

function extensionGrantPath(stateRoot: string, name: string): string {
  if (!isPluginSegment(name)) throw new Error('OpenNeko extension grant identity is invalid.');
  const path = resolve(stateRoot, `${name}.json`);
  if (!isInsideOrEqual(stateRoot, path)) {
    throw new Error('OpenNeko extension grant path escaped its root.');
  }
  return path;
}

function isPluginSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);
}

function isPluginSegmentValue(value: unknown): value is string {
  return typeof value === 'string' && isPluginSegment(value);
}

function isExtensionIdentifier(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  optionalKeys: readonly string[] = [],
): boolean {
  const allowed = new Set(keys);
  for (const key of optionalKeys) allowed.add(key);
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value);
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined | null {
  if (value === undefined) return undefined;
  return isRecord(value) ? value : null;
}

function parsePluginInterfaceLocalization(
  value: unknown,
): AgentExtensionCatalogItem['localization'] | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const entries: Array<readonly [string, { readonly description: string }]> = [];
  for (const [locale, localized] of Object.entries(value)) {
    if (!isPluginLocalizationLocale(locale) || !isRecord(localized)) {
      return null;
    }
    if (Object.keys(localized).length !== 1 || !isNonEmptyString(localized['shortDescription'])) {
      return null;
    }
    entries.push([locale, Object.freeze({ description: localized['shortDescription'].trim() })]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

function isPluginLocalizationLocale(value: string): boolean {
  const [language, ...subtags] = value.split('-');
  return (
    language !== undefined &&
    /^[a-z]{2,3}$/u.test(language) &&
    subtags.every((subtag) => /^[a-z0-9]{2,8}$/u.test(subtag))
  );
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Reflect.get(error, 'code') === 'ENOENT'
  );
}
