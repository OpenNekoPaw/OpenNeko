import { randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';

import type {
  AgentExtensionCatalogItem,
  AgentExtensionCatalogSnapshot,
  AgentExtensionComponentReadiness,
  AgentExtensionComponentReadinessSet,
  AgentExtensionDiagnosticCode,
  AgentExtensionRuntimeDescriptor,
  AgentExtensionRuntimeReadiness,
  AgentExtensionStatus,
} from '@neko/agent-contracts';
import type { PluginStateRecord, PluginStateRepository } from '@neko/local-metadata';

import { createPluginRuntimeSourceFingerprint } from './plugin-runtime-source-fingerprint';

export type {
  AgentExtensionCatalogSnapshot,
  AgentExtensionRuntimeDescriptor,
  AgentExtensionRuntimeReadiness,
} from '@neko/agent-contracts';

const MAX_PLUGIN_DOCUMENT_BYTES = 1_000_000;
const MAX_ICON_BYTES = 512_000;
const MAX_PLUGIN_FILES = 2_000;
const MAX_PLUGIN_BYTES = 50_000_000;

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
  installLocalPlugin(sourcePath: string): Promise<AgentExtensionCatalogSnapshot>;
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
  install(sourcePath: string, operationId: string): Promise<void>;
  enable(pluginId: string, operationId: string): Promise<void>;
  disable(pluginId: string, operationId: string): Promise<void>;
  remove(pluginId: string, operationId: string): Promise<void>;
  reload(): Promise<void>;
}

export function createOpenNekoExtensionRepository(options: {
  readonly bundledPluginRoots: readonly string[];
  readonly installRoot: string;
  readonly pluginStates: PluginStateRepository;
  readonly trashItem: (absolutePath: string) => Promise<void>;
}): AgentExtensionRepositoryPort {
  const bundledPluginRoots = options.bundledPluginRoots.map((root) =>
    requireAbsoluteRoot(root, 'bundled Plugin'),
  );
  const installRoot = requireAbsoluteRoot(options.installRoot, 'install');
  for (const root of bundledPluginRoots) {
    if (isInsideOrEqual(root, installRoot) || isInsideOrEqual(installRoot, root)) {
      throw new Error('Bundled Plugin roots and the local install root must be separate.');
    }
  }
  return new OpenNekoExtensionRepository(
    Object.freeze(bundledPluginRoots),
    installRoot,
    options.pluginStates,
    options.trashItem,
  );
}

export function createAgentExtensionManager(options: {
  readonly repository: AgentExtensionRepositoryPort;
  readonly mutationOwnership: AgentExtensionMutationOwnershipPort;
}): AgentExtensionManager {
  return new DefaultAgentExtensionManager(options.repository, options.mutationOwnership);
}

class DefaultAgentExtensionManager implements AgentExtensionManager {
  private runtimeSourceFingerprint: string | undefined;
  private runtimeReadiness = new Map<string, AgentExtensionRuntimeReadiness>();
  private mutationTail = Promise.resolve();

  constructor(
    private readonly repository: AgentExtensionRepositoryPort,
    private readonly mutationOwnership: AgentExtensionMutationOwnershipPort,
  ) {}

  async readCatalog(): Promise<AgentExtensionCatalogSnapshot> {
    let repositorySnapshot: AgentExtensionRepositorySnapshot;
    try {
      repositorySnapshot = await this.repository.read();
    } catch {
      return createSnapshot([], [], ['repository_failed']);
    }

    const plugins: VerifiedPlugin[] = [];
    const invalidPlugins: Array<{
      readonly entry: RepositoryPluginEntry;
      readonly code: AgentExtensionDiagnosticCode;
    }> = [];
    const runtimeDescriptors: AgentExtensionRuntimeDescriptor[] = [];
    const diagnosticCodes = [...repositorySnapshot.diagnostics];
    for (const entry of repositorySnapshot.entries) {
      if (entry.stateDiagnostic) {
        diagnosticCodes.push(entry.stateDiagnostic);
        invalidPlugins.push({ entry, code: entry.stateDiagnostic });
        continue;
      }
      const plugin = await readPluginPackage(entry);
      if (plugin.status === 'error') {
        diagnosticCodes.push(plugin.code);
        invalidPlugins.push({ entry, code: plugin.code });
        continue;
      }
      plugins.push(plugin.value);
      diagnosticCodes.push(...plugin.value.componentDiagnostics);
      if (entry.enabled && entry.installState === 'installed') {
        runtimeDescriptors.push(plugin.value.runtime);
      }
    }

    let records = [
      ...plugins.map((plugin) => projectExtension(plugin, undefined)),
      ...invalidPlugins.map(({ entry, code }) => projectInvalidExtension(entry, code)),
    ];
    records.sort(compareExtensionRecords);
    runtimeDescriptors.sort((left, right) => left.pluginId.localeCompare(right.pluginId));
    const source = createSnapshot(records, runtimeDescriptors, diagnosticCodes);
    if (this.runtimeSourceFingerprint === createPluginRuntimeSourceFingerprint(source)) {
      records = [
        ...plugins.map((plugin) =>
          projectExtension(plugin, this.runtimeReadiness.get(plugin.entry.pluginId)),
        ),
        ...invalidPlugins.map(({ entry, code }) => projectInvalidExtension(entry, code)),
      ];
      records.sort(compareExtensionRecords);
    }
    return createSnapshot(records, runtimeDescriptors, diagnosticCodes);
  }

  async installLocalPlugin(sourcePath: string): Promise<AgentExtensionCatalogSnapshot> {
    if (!isAbsolute(sourcePath)) throw new Error('Local Plugin source path must be absolute.');
    return this.serializeMutation(async () => {
      await this.repository.install(sourcePath, randomUUID());
      this.clearRuntimeReadiness();
      return this.readCatalog();
    });
  }

  async enablePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot> {
    return this.mutateWithOwnership(pluginId, 'enable', (record) => record.canEnable);
  }

  async disablePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot> {
    return this.mutateWithOwnership(pluginId, 'disable', (record) => record.canDisable);
  }

  async removePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot> {
    return this.mutateWithOwnership(pluginId, 'remove', (record) => record.canRemove);
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

  private mutateWithOwnership(
    pluginId: string,
    mutation: AgentExtensionRuntimeMutation,
    allowed: (record: AgentExtensionCatalogItem) => boolean,
  ): Promise<AgentExtensionCatalogSnapshot> {
    const id = requirePluginId(pluginId);
    const operationId = randomUUID();
    return this.serializeMutation(() =>
      this.mutate(id, allowed, async () => {
        await this.mutationOwnership.assertIdle({ operationId, pluginId: id, mutation });
        await this.repository[mutation](id, operationId);
      }),
    );
  }

  private async mutate(
    pluginId: string,
    allowed: (record: AgentExtensionCatalogItem) => boolean,
    operation: () => Promise<void>,
  ): Promise<AgentExtensionCatalogSnapshot> {
    const before = await this.readCatalog();
    const record = before.records.find((item) => item.id === pluginId);
    if (!record || !allowed(record)) {
      throw new Error(`OpenNeko extension '${pluginId}' does not allow this operation.`);
    }
    await operation();
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
    private readonly bundledPluginRoots: readonly string[],
    private readonly installRoot: string,
    private readonly pluginStates: PluginStateRepository,
    private readonly trashItem: (absolutePath: string) => Promise<void>,
  ) {}

  async read(): Promise<AgentExtensionRepositorySnapshot> {
    const state = await this.pluginStates.list();
    const stateById = new Map(state.records.map((record) => [record.pluginId, record] as const));
    const entries: RepositoryPluginEntry[] = [];
    const diagnostics: AgentExtensionDiagnosticCode[] = state.diagnostics.map(
      () => 'state_invalid',
    );
    for (const diagnostic of state.diagnostics) {
      if (isPluginId(diagnostic.pluginId)) {
        entries.push(
          createRepositoryEntry(
            diagnostic.pluginId,
            resolve(this.installRoot, diagnostic.pluginId),
            'local',
            false,
            'invalid',
            false,
            'state_invalid',
          ),
        );
      }
    }

    for (const root of this.bundledPluginRoots) {
      const identity = await readPluginIdentity(root);
      const pluginId = identity?.name ?? basename(root);
      const durable = stateById.get(pluginId);
      if (durable?.deliverySource === 'local') {
        entries.push(
          createRepositoryEntry(
            pluginId,
            root,
            'bundled',
            false,
            'installed',
            false,
            'state_invalid',
          ),
        );
      } else {
        entries.push(
          createRepositoryEntry(
            pluginId,
            root,
            'bundled',
            durable?.enabled ?? false,
            durable?.installState ?? 'installed',
            false,
            !identity
              ? 'manifest_invalid'
              : durable && durable.installState !== 'installed'
                ? 'state_invalid'
                : undefined,
          ),
        );
      }
      stateById.delete(pluginId);
    }

    for (const durable of stateById.values()) {
      if (durable.deliverySource === 'bundled') {
        entries.push(
          createRepositoryEntry(
            durable.pluginId,
            this.installRoot,
            'bundled',
            durable.enabled,
            durable.installState,
            false,
            'state_invalid',
          ),
        );
        continue;
      }
      const locator = durable.relativeInstallLocator;
      const sourcePath = locator ? resolveContainedLocator(this.installRoot, locator) : undefined;
      entries.push(
        createRepositoryEntry(
          durable.pluginId,
          sourcePath ?? this.installRoot,
          'local',
          durable.enabled,
          durable.installState,
          !durable.enabled,
          sourcePath && durable.installState === 'installed' ? undefined : 'state_invalid',
        ),
      );
    }

    const unique = new Map<string, RepositoryPluginEntry>();
    const collided = new Set<string>();
    for (const entry of entries) {
      if (unique.has(entry.pluginId)) {
        unique.delete(entry.pluginId);
        collided.add(entry.pluginId);
        diagnostics.push('repository_invalid');
      } else if (!collided.has(entry.pluginId)) {
        unique.set(entry.pluginId, entry);
      }
    }
    return Object.freeze({
      entries: Object.freeze(
        [...unique.values()].sort((a, b) => a.pluginId.localeCompare(b.pluginId)),
      ),
      diagnostics: Object.freeze(diagnostics),
    });
  }

  async install(sourcePath: string, _operationId: string): Promise<void> {
    const sourceRoot = requireAbsoluteRoot(sourcePath, 'source');
    if (
      isInsideOrEqual(this.installRoot, sourceRoot) ||
      isInsideOrEqual(sourceRoot, this.installRoot)
    ) {
      throw new Error('Local Plugin source must be separate from the managed install root.');
    }
    await mkdir(this.installRoot, { recursive: true });
    const staging = resolve(this.installRoot, `.staging-${randomUUID()}`);
    let pluginId: string | undefined;
    try {
      await copyPluginTree(sourceRoot, staging);
      const identity = await readPluginIdentity(staging);
      if (!identity) throw new Error('Local Plugin manifest is invalid.');
      pluginId = identity.name;
      const [durableState, bundledIdentities] = await Promise.all([
        this.pluginStates.get(pluginId),
        Promise.all(this.bundledPluginRoots.map((root) => readPluginIdentity(root))),
      ]);
      const current = await this.read();
      if (
        durableState ||
        bundledIdentities.some((candidate) => candidate?.name === pluginId) ||
        current.entries.some((entry) => entry.pluginId === pluginId)
      ) {
        throw new Error(`OpenNeko extension '${pluginId}' already exists.`);
      }
      const verification = await readPluginPackage(
        createRepositoryEntry(pluginId, staging, 'local', false, 'installing', true),
      );
      if (verification.status === 'error') throw new Error('Local Plugin package is invalid.');
      const target = resolveContainedLocator(this.installRoot, pluginId);
      if (!target) throw new Error('Local Plugin identity cannot be used as an install locator.');
      await this.pluginStates.put({
        pluginId,
        deliverySource: 'local',
        relativeInstallLocator: pluginId,
        installState: 'installing',
        enabled: false,
        configurationReference: null,
      });
      await rename(staging, target);
      await this.pluginStates.setInstallState(pluginId, 'installed');
    } catch (error) {
      if (pluginId) {
        try {
          const state = await this.pluginStates.get(pluginId);
          if (state) await this.pluginStates.setInstallState(pluginId, 'invalid');
        } catch {
          // The original installation failure remains authoritative.
        }
      }
      throw error;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  async enable(pluginId: string, _operationId: string): Promise<void> {
    const id = requirePluginId(pluginId);
    const snapshot = await this.read();
    const entry = snapshot.entries.find((candidate) => candidate.pluginId === id);
    if (!entry || entry.stateDiagnostic || entry.installState !== 'installed') {
      throw new Error(`OpenNeko extension '${id}' is unavailable.`);
    }
    const verified = await readPluginPackage(entry);
    if (verified.status === 'error')
      throw new Error(`OpenNeko extension '${id}' package is invalid.`);
    const current = await this.pluginStates.get(id);
    if (current) {
      await this.pluginStates.setEnabled(id, true);
      return;
    }
    if (entry.deliverySource !== 'bundled') {
      throw new Error(`OpenNeko extension '${id}' state is missing.`);
    }
    await this.pluginStates.put({
      pluginId: id,
      deliverySource: 'bundled',
      relativeInstallLocator: null,
      installState: 'installed',
      enabled: true,
      configurationReference: null,
    });
  }

  async disable(pluginId: string, _operationId: string): Promise<void> {
    const id = requirePluginId(pluginId);
    await this.pluginStates.setEnabled(id, false);
  }

  async remove(pluginId: string, _operationId: string): Promise<void> {
    const id = requirePluginId(pluginId);
    const state = await this.pluginStates.get(id);
    if (!state || state.deliverySource !== 'local' || state.enabled) {
      throw new Error(`OpenNeko extension '${id}' cannot be removed.`);
    }
    const locator = state.relativeInstallLocator;
    const target = locator ? resolveContainedLocator(this.installRoot, locator) : undefined;
    if (!target) throw new Error(`OpenNeko extension '${id}' install state is invalid.`);
    const identity = await readPluginIdentity(target);
    if (identity?.name !== id) throw new Error(`OpenNeko extension '${id}' install is invalid.`);
    await this.trashItem(await realpath(target));
    await this.pluginStates.remove(id);
  }

  async reload(): Promise<void> {
    await this.read();
  }
}

interface RepositoryPluginEntry {
  readonly pluginId: string;
  readonly sourcePath: string;
  readonly enabled: boolean;
  readonly canRemove: boolean;
  readonly deliverySource: AgentExtensionCatalogItem['deliverySource'];
  readonly installState: PluginStateRecord['installState'];
  readonly stateDiagnostic?: AgentExtensionDiagnosticCode;
}

interface VerifiedPlugin {
  readonly entry: RepositoryPluginEntry;
  readonly version: string;
  readonly displayName: string;
  readonly description: string;
  readonly localization: AgentExtensionCatalogItem['localization'];
  readonly developer: string;
  readonly iconDataUrl: string;
  readonly runtime: AgentExtensionRuntimeDescriptor;
  readonly componentReadiness: AgentExtensionComponentReadinessSet;
  readonly componentDiagnostics: readonly AgentExtensionDiagnosticCode[];
}

type ReadResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'error'; readonly code: AgentExtensionDiagnosticCode };

function createRepositoryEntry(
  pluginId: string,
  sourcePath: string,
  deliverySource: AgentExtensionCatalogItem['deliverySource'],
  enabled: boolean,
  installState: PluginStateRecord['installState'],
  canRemove: boolean,
  stateDiagnostic?: AgentExtensionDiagnosticCode,
): RepositoryPluginEntry {
  return Object.freeze({
    pluginId,
    sourcePath: resolve(sourcePath),
    deliverySource,
    enabled,
    installState,
    canRemove,
    ...(stateDiagnostic ? { stateDiagnostic } : {}),
  });
}

async function readPluginIdentity(
  pluginRoot: string,
): Promise<{ readonly name: string; readonly version: string } | undefined> {
  const manifest = await readJsonRecord(
    resolve(pluginRoot, 'plugin.json'),
    pluginRoot,
    'manifest_invalid',
  );
  if (
    manifest.status === 'error' ||
    !isPluginId(manifest.value['name']) ||
    !isNonEmptyString(manifest.value['version'])
  ) {
    return undefined;
  }
  return Object.freeze({ name: manifest.value['name'], version: manifest.value['version'] });
}

async function readPluginPackage(
  entry: RepositoryPluginEntry,
): Promise<ReadResult<VerifiedPlugin>> {
  let pluginRoot: string;
  try {
    const [canonicalRoot, info] = await Promise.all([
      realpath(entry.sourcePath),
      lstat(entry.sourcePath),
    ]);
    if (!info.isDirectory() || info.isSymbolicLink())
      return { status: 'error', code: 'manifest_invalid' };
    pluginRoot = canonicalRoot;
  } catch {
    return { status: 'error', code: 'manifest_invalid' };
  }
  const manifestResult = await readJsonRecord(
    resolve(pluginRoot, 'plugin.json'),
    pluginRoot,
    'manifest_invalid',
  );
  if (manifestResult.status === 'error') return manifestResult;
  const manifest = parsePluginManifest(manifestResult.value);
  if (!manifest || manifest.name !== entry.pluginId)
    return { status: 'error', code: 'manifest_invalid' };

  const skills = await readFixedSkillRoot(pluginRoot);
  const mcp = await readFixedMcpDocument(pluginRoot);
  const apps = parseAppContribution(manifest.openNeko?.apps);
  const icon = await readIcon(manifest.openNeko?.logo, pluginRoot);
  if (icon.status === 'error') return icon;
  const componentDiagnostics: AgentExtensionDiagnosticCode[] = [];
  if (skills.status === 'error') componentDiagnostics.push('skill_invalid');
  if (mcp.status === 'error' || apps.status === 'error')
    componentDiagnostics.push('contribution_invalid');
  const mcpValue = mcp.status === 'ok' ? mcp.value : { ids: [] as readonly string[] };
  const appIds = apps.status === 'ok' ? apps.value : [];
  const runtime = Object.freeze({
    pluginId: entry.pluginId,
    pluginRoot,
    ...(skills.status === 'ok' && skills.value ? { skillRoot: skills.value } : {}),
    ...(mcp.status === 'ok' && mcp.value.path ? { mcpDocumentPath: mcp.value.path } : {}),
    mcpServerIds: mcpValue.ids,
    ...(manifest.openNeko?.mcpToolExposure
      ? { mcpToolExposure: manifest.openNeko.mcpToolExposure }
      : {}),
    appIds,
  }) satisfies AgentExtensionRuntimeDescriptor;
  return {
    status: 'ok',
    value: Object.freeze({
      entry,
      version: manifest.version,
      displayName: manifest.openNeko?.displayName ?? manifest.name,
      description: manifest.description ?? '',
      localization: manifest.openNeko?.localization ?? Object.freeze({}),
      developer: manifest.author,
      iconDataUrl: icon.value,
      runtime,
      componentReadiness: Object.freeze({
        skills: verificationReadiness(skills, entry.enabled),
        mcp: verificationReadiness(mcp, entry.enabled),
        apps: verificationReadiness(apps, entry.enabled, 'app-unsupported'),
      }),
      componentDiagnostics: Object.freeze(componentDiagnostics),
    }),
  };
}

interface ParsedPluginManifest {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly author: string;
  readonly openNeko?: {
    readonly displayName?: string;
    readonly localization?: AgentExtensionCatalogItem['localization'];
    readonly logo?: string;
    readonly mcpToolExposure?: 'adapter-only';
    readonly apps?: readonly string[];
  };
}

function parsePluginManifest(value: Record<string, unknown>): ParsedPluginManifest | undefined {
  if (
    !hasOnlyKeys(value, [
      'name',
      'version',
      'description',
      'author',
      'homepage',
      'repository',
      'license',
      'keywords',
      'extensions',
    ])
  )
    return undefined;
  if (!isPluginId(value['name']) || !isNonEmptyString(value['version'])) return undefined;
  if (
    !isOptionalString(value['description']) ||
    !isOptionalString(value['homepage']) ||
    !isOptionalString(value['repository']) ||
    !isOptionalString(value['license'])
  )
    return undefined;
  if (
    value['keywords'] !== undefined &&
    (!Array.isArray(value['keywords']) || value['keywords'].some((item) => !isNonEmptyString(item)))
  )
    return undefined;
  const author = parseAuthor(value['author']);
  if (author === undefined) return undefined;
  const extensions = optionalRecord(value['extensions']);
  if (extensions === null) return undefined;
  if (extensions && Object.keys(extensions).some((key) => !isReverseDomainKey(key)))
    return undefined;
  const openNekoValue = extensions?.['io.openneko'];
  const openNeko = parseOpenNekoMetadata(openNekoValue);
  if (openNeko === null) return undefined;
  return Object.freeze({
    name: value['name'],
    version: value['version'],
    ...(value['description'] === undefined ? {} : { description: value['description'] }),
    author,
    ...(openNeko === undefined ? {} : { openNeko }),
  });
}

function parseAuthor(value: unknown): string | undefined {
  if (value === undefined) return '';
  if (isNonEmptyString(value)) return value;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['name', 'email', 'url']) ||
    !isNonEmptyString(value['name']) ||
    !isOptionalString(value['email']) ||
    !isOptionalString(value['url'])
  )
    return undefined;
  return value['name'];
}

function parseOpenNekoMetadata(value: unknown): ParsedPluginManifest['openNeko'] | null {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['displayName', 'localization', 'logo', 'mcpToolExposure', 'apps'])
  )
    return null;
  const localization = parsePluginLocalization(value['localization']);
  if (
    localization === null ||
    !isOptionalString(value['displayName']) ||
    !isOptionalString(value['logo']) ||
    (value['mcpToolExposure'] !== undefined && value['mcpToolExposure'] !== 'adapter-only') ||
    (value['apps'] !== undefined &&
      (!Array.isArray(value['apps']) ||
        value['apps'].some((id) => !isExtensionIdentifierValue(id)) ||
        new Set(value['apps']).size !== value['apps'].length))
  )
    return null;
  return Object.freeze({
    ...(value['displayName'] === undefined ? {} : { displayName: value['displayName'] }),
    ...(localization === undefined ? {} : { localization }),
    ...(value['logo'] === undefined ? {} : { logo: value['logo'] }),
    ...(value['mcpToolExposure'] === undefined ? {} : { mcpToolExposure: 'adapter-only' as const }),
    ...(value['apps'] === undefined ? {} : { apps: Object.freeze([...value['apps']] as string[]) }),
  });
}

function parsePluginLocalization(
  value: unknown,
): AgentExtensionCatalogItem['localization'] | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const entries: Array<readonly [string, { readonly description: string }]> = [];
  for (const [locale, localized] of Object.entries(value)) {
    if (
      !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/u.test(locale) ||
      !isRecord(localized) ||
      !hasOnlyKeys(localized, ['description']) ||
      !isNonEmptyString(localized['description'])
    )
      return null;
    entries.push([locale, Object.freeze({ description: localized['description'] })]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

async function readFixedSkillRoot(pluginRoot: string): Promise<ComponentReadResult<string>> {
  const skillRoot = resolve(pluginRoot, 'skills');
  try {
    const [canonical, info] = await Promise.all([realpath(skillRoot), lstat(skillRoot)]);
    if (!isInsideOrEqual(pluginRoot, canonical) || !info.isDirectory() || info.isSymbolicLink())
      return { status: 'error' };
    return { status: 'ok', value: canonical };
  } catch (error) {
    return isEnoent(error) ? { status: 'absent' } : { status: 'error' };
  }
}

async function readFixedMcpDocument(
  pluginRoot: string,
): Promise<ComponentReadResult<{ readonly path: string; readonly ids: readonly string[] }>> {
  const path = resolve(pluginRoot, 'mcp.json');
  const document = await readJsonFile(path, pluginRoot);
  if (document.status === 'missing') return { status: 'absent' };
  if (document.status === 'error') return { status: 'error' };
  if (!hasOnlyKeys(document.value, ['mcpServers']) || !isRecord(document.value['mcpServers']))
    return { status: 'error' };
  const ids = Object.keys(document.value['mcpServers']).sort();
  if (
    ids.some((id) => !isExtensionIdentifier(id)) ||
    Object.values(document.value['mcpServers']).some((item) => !isRecord(item))
  )
    return { status: 'error' };
  return { status: 'ok', value: Object.freeze({ path, ids: Object.freeze(ids) }) };
}

function parseAppContribution(
  value: readonly string[] | undefined,
): ComponentReadResult<readonly string[]> {
  return value === undefined ? { status: 'absent' } : { status: 'ok', value };
}

type ComponentReadResult<T> =
  | { readonly status: 'absent' }
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'error' };

function verificationReadiness(
  result: ComponentReadResult<unknown>,
  enabled: boolean,
  unsupportedCode?: string,
): AgentExtensionComponentReadiness {
  if (result.status === 'absent') return Object.freeze({ status: 'absent', diagnosticCode: '' });
  if (result.status === 'error')
    return Object.freeze({ status: 'error', diagnosticCode: 'contribution-invalid' });
  if (!enabled) return Object.freeze({ status: 'disabled', diagnosticCode: '' });
  if (unsupportedCode)
    return Object.freeze({ status: 'unsupported', diagnosticCode: unsupportedCode });
  return Object.freeze({ status: 'error', diagnosticCode: 'runtime-not-composed' });
}

function projectExtension(
  plugin: VerifiedPlugin,
  readiness: AgentExtensionRuntimeReadiness | undefined,
): AgentExtensionCatalogItem {
  const { entry, runtime } = plugin;
  let agentStatus: AgentExtensionStatus;
  let runtimeDiagnosticCode: string;
  if (!entry.enabled) {
    agentStatus = 'disabled';
    runtimeDiagnosticCode = '';
  } else if (readiness) {
    agentStatus = readiness.status;
    runtimeDiagnosticCode = readiness.diagnosticCode;
  } else if (!runtime.skillRoot && runtime.mcpServerIds.length === 0 && runtime.appIds.length > 0) {
    agentStatus = 'unsupported';
    runtimeDiagnosticCode = 'app-unsupported';
  } else if (!runtime.skillRoot && runtime.mcpServerIds.length === 0) {
    agentStatus = plugin.componentDiagnostics.length > 0 ? 'error' : 'unsupported';
    runtimeDiagnosticCode =
      plugin.componentDiagnostics.length > 0 ? 'contribution-invalid' : 'no-agent-contribution';
  } else {
    agentStatus = 'error';
    runtimeDiagnosticCode = 'runtime-not-composed';
  }
  return Object.freeze({
    id: entry.pluginId,
    name: entry.pluginId,
    displayName: plugin.displayName,
    description: plugin.description,
    localization: plugin.localization,
    version: plugin.version,
    developer: plugin.developer,
    enabled: entry.enabled,
    canEnable: !entry.enabled && entry.installState === 'installed',
    canDisable: entry.enabled,
    canRemove: entry.canRemove,
    deliverySource: entry.deliverySource,
    agentStatus,
    runtimeDiagnosticCode,
    componentReadiness: readiness
      ? mergeComponentReadiness(plugin.componentReadiness, readiness.componentReadiness)
      : plugin.componentReadiness,
    iconDataUrl: plugin.iconDataUrl,
    mcpServerIds: runtime.mcpServerIds,
    hasSkills: runtime.skillRoot !== undefined,
    appIds: runtime.appIds,
  });
}

function mergeComponentReadiness(
  verification: AgentExtensionComponentReadinessSet,
  runtime: AgentExtensionComponentReadinessSet,
): AgentExtensionComponentReadinessSet {
  const merge = (
    verified: AgentExtensionComponentReadiness,
    composed: AgentExtensionComponentReadiness,
  ): AgentExtensionComponentReadiness =>
    verified.status === 'absent' ||
    (verified.status === 'error' && verified.diagnosticCode !== 'runtime-not-composed')
      ? verified
      : composed;
  return Object.freeze({
    skills: merge(verification.skills, runtime.skills),
    mcp: merge(verification.mcp, runtime.mcp),
    apps: merge(verification.apps, runtime.apps),
  });
}

function projectInvalidExtension(
  entry: RepositoryPluginEntry,
  code: AgentExtensionDiagnosticCode,
): AgentExtensionCatalogItem {
  const error = Object.freeze({
    status: 'error' as const,
    diagnosticCode: code.replaceAll('_', '-'),
  });
  return Object.freeze({
    id: entry.pluginId,
    name: entry.pluginId,
    displayName: entry.pluginId,
    description: '',
    localization: Object.freeze({}),
    version: '',
    developer: '',
    enabled: entry.enabled,
    canEnable: false,
    canDisable: entry.enabled,
    canRemove: entry.canRemove,
    deliverySource: entry.deliverySource,
    agentStatus: 'error',
    runtimeDiagnosticCode: code.replaceAll('_', '-'),
    componentReadiness: Object.freeze({ skills: error, mcp: error, apps: error }),
    iconDataUrl: '',
    mcpServerIds: [],
    hasSkills: false,
    appIds: [],
  });
}

async function readIcon(
  locator: string | undefined,
  pluginRoot: string,
): Promise<ReadResult<string>> {
  if (locator === undefined) return { status: 'ok', value: '' };
  const iconPath = resolvePackagePath(pluginRoot, locator);
  if (!iconPath) return { status: 'error', code: 'manifest_invalid' };
  const extension = /\.(png|jpe?g|webp|gif|svg)$/iu.exec(iconPath)?.[1]?.toLowerCase();
  if (!extension) return { status: 'error', code: 'manifest_invalid' };
  try {
    const [canonical, info] = await Promise.all([realpath(iconPath), lstat(iconPath)]);
    if (!isInsideOrEqual(pluginRoot, canonical) || !info.isFile() || info.isSymbolicLink())
      return { status: 'error', code: 'manifest_invalid' };
    if (info.size > MAX_ICON_BYTES) return { status: 'ok', value: '' };
    const data = await readFile(canonical);
    const mediaType =
      extension === 'jpg' || extension === 'jpeg'
        ? 'jpeg'
        : extension === 'svg'
          ? 'svg+xml'
          : extension;
    return { status: 'ok', value: `data:image/${mediaType};base64,${data.toString('base64')}` };
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
    )
      return { status: 'error' };
    const parsed: unknown = JSON.parse(await readFile(canonicalFile, 'utf8'));
    return isRecord(parsed) ? { status: 'ok', value: parsed } : { status: 'error' };
  } catch (error) {
    return isEnoent(error) ? { status: 'missing' } : { status: 'error' };
  }
}

async function copyPluginTree(sourceRoot: string, targetRoot: string): Promise<void> {
  const [canonicalSource, info] = await Promise.all([realpath(sourceRoot), lstat(sourceRoot)]);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error('Local Plugin source is invalid.');
  let files = 0;
  let bytes = 0;
  const copyDirectory = async (source: string, target: string): Promise<void> => {
    await mkdir(target, { recursive: false });
    const children = await readdir(source, { withFileTypes: true });
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const sourcePath = resolve(source, child.name);
      const targetPath = resolve(target, child.name);
      const childInfo = await lstat(sourcePath);
      if (childInfo.isSymbolicLink())
        throw new Error('Local Plugin packages cannot contain symbolic links.');
      if (childInfo.isDirectory()) {
        await copyDirectory(sourcePath, targetPath);
      } else if (childInfo.isFile()) {
        files += 1;
        bytes += childInfo.size;
        if (files > MAX_PLUGIN_FILES || bytes > MAX_PLUGIN_BYTES)
          throw new Error('Local Plugin package exceeds installation limits.');
        await copyFile(sourcePath, targetPath, 0);
      } else {
        throw new Error('Local Plugin package contains an unsupported filesystem entry.');
      }
    }
  };
  await copyDirectory(canonicalSource, targetRoot);
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
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, count]) => Object.freeze({ code, count })),
    ),
  });
}

function compareExtensionRecords(
  left: AgentExtensionCatalogItem,
  right: AgentExtensionCatalogItem,
): number {
  return left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id);
}

function resolvePackagePath(pluginRoot: string, locator: string): string | undefined {
  if (isAbsolute(locator)) return undefined;
  const path = resolve(pluginRoot, locator);
  return isInsideOrEqual(pluginRoot, path) ? path : undefined;
}

function resolveContainedLocator(root: string, locator: string): string | undefined {
  if (!isPluginId(locator) || isAbsolute(locator)) return undefined;
  const path = resolve(root, locator);
  return isInsideOrEqual(root, path) ? path : undefined;
}

function isInsideOrEqual(root: string, target: string): boolean {
  const pathFromRoot = relative(resolve(root), resolve(target));
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

function requirePluginId(value: string): string {
  if (!isPluginId(value)) throw new Error('Desktop Plugin identity is invalid.');
  return value;
}

function isPluginId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(value) &&
    !value.includes('..')
  );
}

function requireAbsoluteRoot(value: string, name: string): string {
  if (!isAbsolute(value)) throw new Error(`OpenNeko extension ${name} root must be absolute.`);
  return resolve(value);
}

function isReverseDomainKey(value: string): boolean {
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(value);
}

function isExtensionIdentifier(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);
}

function isExtensionIdentifierValue(value: unknown): value is string {
  return typeof value === 'string' && isExtensionIdentifier(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalRecord(value: unknown): Record<string, unknown> | null | undefined {
  return value === undefined ? undefined : isRecord(value) ? value : null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isEnoent(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT';
}
