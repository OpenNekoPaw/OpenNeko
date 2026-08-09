import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import type {
  AgentExtensionCatalogItem,
  AgentExtensionCatalogSnapshot,
  AgentExtensionArtifactOperationKind,
  AgentExtensionArtifactOperationPhase,
  AgentExtensionArtifactOperationSnapshot,
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
const MAX_PACKAGE_FILES = 2_048;
const MAX_PACKAGE_BYTES = 100_000_000;
const MAX_ARTIFACT_BYTES = 1_000_000_000;

export interface AgentExtensionArtifactPlatform {
  readonly os: string;
  readonly arch: string;
}

export interface AgentExtensionReviewedArtifact {
  readonly platform: AgentExtensionArtifactPlatform;
  readonly archive: 'zip' | 'tar.gz';
  readonly url: string;
  readonly allowedHosts: readonly string[];
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly signature: {
    readonly algorithm: 'ed25519';
    readonly keyId: string;
    readonly value: string;
  };
  readonly provenance: {
    readonly sourceRepository: string;
    readonly sourceCommit: string;
    readonly buildRecipeSha256: string;
  };
  readonly licenseInventory: {
    readonly path: string;
    readonly sha256: string;
  };
}

export interface AgentExtensionArtifactStageReceipt {
  readonly operationId: string;
  readonly pluginId: string;
  readonly packageRelease: string;
  readonly artifactUrl: string;
  readonly finalUrl: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly signatureKeyId: string;
  readonly signatureVerified: boolean;
  readonly provenance: AgentExtensionReviewedArtifact['provenance'];
  readonly licenseInventory: AgentExtensionReviewedArtifact['licenseInventory'];
  readonly stagingRoot: string;
}

export interface AgentExtensionArtifactHostPort {
  readonly available: boolean;
  readonly platform: AgentExtensionArtifactPlatform;
  stage(input: {
    readonly operationId: string;
    readonly pluginId: string;
    readonly packageRelease: string;
    readonly artifact: AgentExtensionReviewedArtifact;
    readonly installRoot: string;
    readonly stagingRoot: string;
    readonly signal: AbortSignal;
    readonly reportProgress: (transferredBytes: number) => void;
  }): Promise<AgentExtensionArtifactStageReceipt>;
  commit(input: {
    readonly operationId: string;
    readonly stagingRoot: string;
    readonly targetRoot: string;
  }): Promise<void>;
  discard(operationId: string): Promise<void>;
}

export interface AgentExtensionSupportPort {
  isSupported(descriptor: AgentExtensionRuntimeDescriptor): Promise<boolean>;
}

export type AgentExtensionRuntimeMutation = 'enable' | 'disable' | 'update' | 'remove';

export interface AgentExtensionMutationOwnershipPort {
  assertIdle(input: {
    readonly operationId: string;
    readonly pluginId: string;
    readonly mutation: AgentExtensionRuntimeMutation;
  }): Promise<void>;
}

export function createAgentExtensionMutationOwnership(options: {
  readonly hasActiveAgentTurns: () => boolean;
  readonly listOwnedAutomationSessions: (
    pluginId: string,
  ) => readonly { readonly sessionId: string }[];
}): AgentExtensionMutationOwnershipPort {
  return {
    async assertIdle({ pluginId, mutation }) {
      if (options.hasActiveAgentTurns()) {
        throw new Error(
          `OpenNeko extension '${pluginId}' cannot ${mutation} while an Agent turn is active.`,
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
  readArtifactOperations(): readonly AgentExtensionArtifactOperationSnapshot[];
  cancelArtifactOperation(operationId: string): void;
  installPlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot>;
  updatePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot>;
  enablePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot>;
  disablePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot>;
  removePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot>;
  refreshMarketplaces(): Promise<AgentExtensionCatalogSnapshot>;
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
  install(pluginId: string, operation: AgentExtensionArtifactOperationContext): Promise<void>;
  update(
    pluginId: string,
    operation: AgentExtensionArtifactOperationContext,
    assertCommitIdle: () => Promise<void>,
  ): Promise<void>;
  enable(
    pluginId: string,
    operationId: string,
    acceptedPermissions: readonly string[],
  ): Promise<void>;
  disable(pluginId: string, operationId: string): Promise<void>;
  remove(pluginId: string, operationId: string): Promise<void>;
  reload(): Promise<void>;
}

export interface AgentExtensionArtifactOperationContext {
  readonly operationId: string;
  readonly signal: AbortSignal;
  readonly reportPhase: (phase: Exclude<AgentExtensionArtifactOperationPhase, 'queued'>) => void;
  readonly reportProgress: (transferredBytes: number) => void;
}

export function createOpenNekoExtensionRepository(options: {
  readonly marketplaceRoot: string;
  readonly installRoot: string;
  readonly stateRoot: string;
  readonly artifactHost: AgentExtensionArtifactHostPort;
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
    options.artifactHost,
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
  private readonly artifactOperations = new Map<string, MutableArtifactOperation>();

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
      if (entry.integrityDiagnostic) {
        diagnosticCodes.push(entry.integrityDiagnostic);
        if (entry.installed) {
          invalidInstalledPlugins.push({ entry, code: entry.integrityDiagnostic });
        }
        continue;
      }
      const plugin = await readPluginPackage(entry);
      if (plugin.status === 'error') {
        diagnosticCodes.push(plugin.code);
        if (entry.installed) invalidInstalledPlugins.push({ entry, code: plugin.code });
        continue;
      }
      let verifiedPlugin = plugin.value;
      if (entry.updateCandidate) {
        const candidate = await readPluginPackage(
          createRepositoryEntry({
            name: entry.name,
            version: entry.updateCandidate.packageRelease,
            authorityRoot: entry.updateCandidate.authorityRoot,
            sourcePath: entry.updateCandidate.sourcePath,
            installed: false,
            artifact: entry.updateCandidate.artifact,
          }),
        );
        if (candidate.status === 'error') {
          diagnosticCodes.push(candidate.code);
        } else {
          verifiedPlugin = Object.freeze({
            ...verifiedPlugin,
            updatePackageRelease: candidate.value.entry.version,
          });
        }
      }
      if (
        entry.installed ||
        entry.listed ||
        (await this.agentSupport.isSupported(verifiedPlugin.runtime))
      ) {
        visiblePlugins.push(verifiedPlugin);
      }
      if (entry.installed && entry.enabled) runtimeDescriptors.push(verifiedPlugin.runtime);
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

  readArtifactOperations(): readonly AgentExtensionArtifactOperationSnapshot[] {
    return Object.freeze(
      [...this.artifactOperations.values()]
        .map(projectArtifactOperation)
        .sort((left, right) => left.operationId.localeCompare(right.operationId)),
    );
  }

  cancelArtifactOperation(operationId: string): void {
    const operation = this.artifactOperations.get(requireOperationId(operationId));
    if (!operation || operation.status !== 'active') {
      throw new Error(`Extension artifact operation '${operationId}' is not active.`);
    }
    if (operation.phase === 'committing' || operation.phase === 'cancelling') {
      throw new Error(`Extension artifact operation '${operationId}' cannot be cancelled now.`);
    }
    operation.phase = 'cancelling';
    operation.controller.abort();
  }

  async installPlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot> {
    const id = requireOpenNekoPluginId(pluginId);
    return this.runArtifactOperation(id, 'install', (operation) =>
      this.serializeMutation(() =>
        this.mutate(
          id,
          (record) => record.canInstall,
          async (record) => {
            this.setArtifactOperationTotal(operation.operationId, record.downloadSizeBytes);
            await this.repository.install(id, operation);
          },
        ),
      ),
    );
  }

  async enablePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot> {
    const id = requireOpenNekoPluginId(pluginId);
    const operationId = randomUUID();
    return this.serializeMutation(() =>
      this.mutate(
        id,
        (record) => record.canEnable,
        async (record) => {
          await this.mutationOwnership.assertIdle({
            operationId,
            pluginId: id,
            mutation: 'enable',
          });
          await this.repository.enable(id, operationId, record.declaredPermissions);
        },
      ),
    );
  }

  async updatePlugin(pluginId: string): Promise<AgentExtensionCatalogSnapshot> {
    const id = requireOpenNekoPluginId(pluginId);
    const operationId = randomUUID();
    const assertIdle = () =>
      this.mutationOwnership.assertIdle({
        operationId,
        pluginId: id,
        mutation: 'update',
      });
    return this.runArtifactOperation(
      id,
      'update',
      (operation) =>
        this.serializeMutation(() =>
          this.mutate(
            id,
            (record) => record.canUpdate,
            async (record) => {
              this.setArtifactOperationTotal(operation.operationId, record.downloadSizeBytes);
              await assertIdle();
              await this.repository.update(id, operation, assertIdle);
            },
          ),
        ),
      operationId,
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

  async refreshMarketplaces(): Promise<AgentExtensionCatalogSnapshot> {
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

  private async runArtifactOperation<T>(
    pluginId: string,
    kind: AgentExtensionArtifactOperationKind,
    run: (context: AgentExtensionArtifactOperationContext) => Promise<T>,
    operationId = randomUUID(),
  ): Promise<T> {
    for (const [candidateId, candidate] of this.artifactOperations) {
      if (candidate.pluginId === pluginId && candidate.status !== 'active') {
        this.artifactOperations.delete(candidateId);
      }
    }
    const controller = new AbortController();
    const operation: MutableArtifactOperation = {
      operationId,
      pluginId,
      kind,
      phase: 'queued',
      status: 'active',
      transferredBytes: 0,
      totalBytes: 0,
      controller,
    };
    this.artifactOperations.set(operationId, operation);
    const context: AgentExtensionArtifactOperationContext = {
      operationId,
      signal: controller.signal,
      reportPhase: (phase) => {
        throwIfArtifactOperationAborted(controller.signal);
        if (operation.status !== 'active' || operation.phase === 'committing') {
          throw new Error(`Extension artifact operation '${operationId}' phase is final.`);
        }
        operation.phase = phase;
      },
      reportProgress: (transferredBytes) => {
        throwIfArtifactOperationAborted(controller.signal);
        if (
          operation.status !== 'active' ||
          !Number.isSafeInteger(transferredBytes) ||
          transferredBytes < operation.transferredBytes ||
          transferredBytes > operation.totalBytes
        ) {
          throw new Error(`Extension artifact operation '${operationId}' progress is invalid.`);
        }
        operation.transferredBytes = transferredBytes;
      },
    };
    try {
      throwIfArtifactOperationAborted(controller.signal);
      const result = await run(context);
      operation.status = 'completed';
      operation.transferredBytes = operation.totalBytes;
      return result;
    } catch (error) {
      if (controller.signal.aborted) {
        operation.status = 'cancelled';
        operation.phase = 'cancelling';
        throw createArtifactOperationAbortError(operationId);
      }
      operation.status = 'failed';
      throw error;
    }
  }

  private setArtifactOperationTotal(operationId: string, totalBytes: number): void {
    const operation = this.artifactOperations.get(operationId);
    if (!operation || operation.status !== 'active' || totalBytes <= 0) {
      throw new Error(`Extension artifact operation '${operationId}' total size is invalid.`);
    }
    operation.totalBytes = totalBytes;
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

interface MutableArtifactOperation {
  readonly operationId: string;
  readonly pluginId: string;
  readonly kind: AgentExtensionArtifactOperationKind;
  phase: AgentExtensionArtifactOperationPhase;
  status: AgentExtensionArtifactOperationSnapshot['status'];
  transferredBytes: number;
  totalBytes: number;
  readonly controller: AbortController;
}

function projectArtifactOperation(
  operation: MutableArtifactOperation,
): AgentExtensionArtifactOperationSnapshot {
  const diagnosticCode =
    operation.status === 'cancelled'
      ? 'cancelled'
      : operation.status === 'failed'
        ? 'operation-failed'
        : '';
  return Object.freeze({
    operationId: operation.operationId,
    pluginId: operation.pluginId,
    kind: operation.kind,
    phase: operation.phase,
    status: operation.status,
    transferredBytes: operation.transferredBytes,
    totalBytes: operation.totalBytes,
    canCancel:
      operation.status === 'active' &&
      operation.phase !== 'committing' &&
      operation.phase !== 'cancelling',
    diagnosticCode,
  });
}

function requireOperationId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) {
    throw new Error('Extension artifact operation identity is invalid.');
  }
  return value;
}

function throwIfArtifactOperationAborted(signal: AbortSignal): void {
  if (signal.aborted) throw createArtifactOperationAbortError('cancelled');
}

function createArtifactOperationAbortError(operationId: string): Error {
  const error = new Error(`Extension artifact operation '${operationId}' was cancelled.`);
  error.name = 'AbortError';
  return error;
}

class OpenNekoExtensionRepository implements AgentExtensionRepositoryPort {
  private initialization: Promise<readonly AgentExtensionDiagnosticCode[]> | undefined;

  constructor(
    private readonly marketplaceRoot: string,
    private readonly installRoot: string,
    private readonly stateRoot: string,
    private readonly artifactHost: AgentExtensionArtifactHostPort,
    private readonly trashItem: (absolutePath: string) => Promise<void>,
  ) {}

  async read(): Promise<AgentExtensionRepositorySnapshot> {
    const initializationDiagnostics = await this.initialize();
    const [marketplace, installed] = await Promise.all([
      readMarketplaceEntries(this.marketplaceRoot, this.artifactHost),
      readInstalledEntries(this.installRoot, this.stateRoot),
    ]);
    const entries = new Map<string, RepositoryPluginEntry>();
    for (const entry of installed.entries) entries.set(entry.pluginId, entry);
    for (const entry of marketplace.entries) {
      const installedEntry = entries.get(entry.pluginId);
      if (!installedEntry) {
        entries.set(entry.pluginId, entry);
        continue;
      }
      if (
        entry.canInstall &&
        entry.artifact &&
        entry.version !== installedEntry.version &&
        entry.updatesFrom.includes(installedEntry.version)
      ) {
        entries.set(
          entry.pluginId,
          Object.freeze({
            ...installedEntry,
            updateCandidate: Object.freeze({
              packageRelease: entry.version,
              authorityRoot: entry.authorityRoot,
              sourcePath: entry.sourcePath,
              artifact: entry.artifact,
            }),
          }),
        );
      }
    }
    return Object.freeze({
      entries: Object.freeze(
        [...entries.values()].sort((left, right) => left.pluginId.localeCompare(right.pluginId)),
      ),
      diagnostics: Object.freeze([
        ...initializationDiagnostics,
        ...marketplace.diagnostics,
        ...installed.diagnostics,
      ]),
    });
  }

  async enable(
    pluginId: string,
    _operationId: string,
    acceptedPermissions: readonly string[],
  ): Promise<void> {
    const name = pluginNameFromId(pluginId);
    if (
      acceptedPermissions.some((permission) => !isExtensionIdentifier(permission)) ||
      new Set(acceptedPermissions).size !== acceptedPermissions.length
    ) {
      throw new Error(`OpenNeko extension '${pluginId}' permissions are invalid.`);
    }
    const target = resolve(this.installRoot, name);
    const identity = await readPluginIdentity(target);
    if (!identity || identity.name !== name) {
      throw new Error(`OpenNeko extension '${pluginId}' is not installed.`);
    }
    await writeExtensionGrant(this.stateRoot, name, pluginId, acceptedPermissions);
  }

  async disable(pluginId: string, _operationId: string): Promise<void> {
    const name = pluginNameFromId(pluginId);
    await rm(extensionGrantPath(this.stateRoot, name), { force: true });
  }

  async install(
    pluginId: string,
    operation: AgentExtensionArtifactOperationContext,
  ): Promise<void> {
    const { operationId } = operation;
    const name = pluginNameFromId(pluginId);
    const marketplace = await readMarketplaceEntries(this.marketplaceRoot, this.artifactHost);
    if (marketplace.diagnostics.length > 0) {
      throw new Error('OpenNeko extension marketplace is invalid.');
    }
    const entry = marketplace.entries.find((item) => item.pluginId === pluginId);
    if (!entry?.artifact || !entry.canInstall) {
      throw new Error(`OpenNeko extension '${pluginId}' is not available.`);
    }
    await mkdir(this.installRoot, { recursive: true });
    const target = resolve(this.installRoot, name);
    if (!isInsideOrEqual(this.installRoot, target)) {
      throw new Error('OpenNeko extension install target escaped its root.');
    }
    if (await pathExists(target)) {
      throw new Error(`OpenNeko extension '${pluginId}' is already installed.`);
    }
    const stagingRoot = resolve(this.installRoot, `.artifact-${operationId}`);
    try {
      operation.reportPhase('downloading');
      const receipt = await this.artifactHost.stage({
        operationId,
        pluginId,
        packageRelease: entry.version,
        artifact: entry.artifact,
        installRoot: this.installRoot,
        stagingRoot,
        signal: operation.signal,
        reportProgress: operation.reportProgress,
      });
      operation.reportPhase('verifying');
      await validateArtifactStageReceipt({
        receipt,
        operationId,
        pluginId,
        packageRelease: entry.version,
        artifact: entry.artifact,
        installRoot: this.installRoot,
        stagingRoot,
      });
      await assertPackageTree(receipt.stagingRoot);
      const stagedEntry = createRepositoryEntry({
        name,
        version: entry.version,
        authorityRoot: this.installRoot,
        sourcePath: receipt.stagingRoot,
        installed: true,
      });
      const verified = await readPluginPackage(stagedEntry);
      if (verified.status === 'error') {
        throw new Error(`OpenNeko extension '${pluginId}' package is invalid.`);
      }
      await rm(extensionGrantPath(this.stateRoot, name), { force: true });
      operation.reportPhase('committing');
      await this.artifactHost.commit({
        operationId,
        stagingRoot: receipt.stagingRoot,
        targetRoot: target,
      });
      await writeInstalledArtifactState(this.stateRoot, name, {
        pluginId,
        packageRelease: entry.version,
        platform: entry.artifact.platform,
        archive: entry.artifact.archive,
        artifactUrl: entry.artifact.url,
        finalUrl: receipt.finalUrl,
        sizeBytes: receipt.sizeBytes,
        sha256: receipt.sha256,
        signatureKeyId: receipt.signatureKeyId,
        provenance: receipt.provenance,
        licenseInventory: receipt.licenseInventory,
      });
    } catch (error) {
      try {
        await this.artifactHost.discard(operationId);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `OpenNeko extension '${pluginId}' install and staging cleanup failed.`,
        );
      }
      throw error;
    }
  }

  async update(
    pluginId: string,
    operation: AgentExtensionArtifactOperationContext,
    assertCommitIdle: () => Promise<void>,
  ): Promise<void> {
    const { operationId } = operation;
    const name = pluginNameFromId(pluginId);
    const snapshot = await this.read();
    const entry = snapshot.entries.find((item) => item.pluginId === pluginId);
    const candidate = entry?.updateCandidate;
    const previousArtifact = entry?.installedArtifact;
    if (!entry?.installed || entry.enabled || !candidate || !previousArtifact) {
      throw new Error(`OpenNeko extension '${pluginId}' has no reviewed update.`);
    }
    const target = resolve(this.installRoot, name);
    const stagingRoot = resolve(this.installRoot, `.artifact-${operationId}`);
    const backupRoot = resolve(this.installRoot, `.artifact-backup-${operationId}`);
    let targetMoved = false;
    let candidateCommitted = false;
    try {
      operation.reportPhase('downloading');
      const receipt = await this.artifactHost.stage({
        operationId,
        pluginId,
        packageRelease: candidate.packageRelease,
        artifact: candidate.artifact,
        installRoot: this.installRoot,
        stagingRoot,
        signal: operation.signal,
        reportProgress: operation.reportProgress,
      });
      operation.reportPhase('verifying');
      await validateArtifactStageReceipt({
        receipt,
        operationId,
        pluginId,
        packageRelease: candidate.packageRelease,
        artifact: candidate.artifact,
        installRoot: this.installRoot,
        stagingRoot,
      });
      await assertPackageTree(receipt.stagingRoot);
      const stagedEntry = createRepositoryEntry({
        name,
        version: candidate.packageRelease,
        authorityRoot: this.installRoot,
        sourcePath: receipt.stagingRoot,
        installed: true,
      });
      const [currentPackage, stagedPackage] = await Promise.all([
        readPluginPackage(entry),
        readPluginPackage(stagedEntry),
      ]);
      if (currentPackage.status === 'error' || stagedPackage.status === 'error') {
        throw new Error(`OpenNeko extension '${pluginId}' update package is invalid.`);
      }
      await assertCommitIdle();
      operation.reportPhase('committing');
      await rename(target, backupRoot);
      targetMoved = true;
      await this.artifactHost.commit({
        operationId,
        stagingRoot: receipt.stagingRoot,
        targetRoot: target,
      });
      candidateCommitted = true;
      await writeInstalledArtifactState(this.stateRoot, name, {
        pluginId,
        packageRelease: candidate.packageRelease,
        platform: candidate.artifact.platform,
        archive: candidate.artifact.archive,
        artifactUrl: candidate.artifact.url,
        finalUrl: receipt.finalUrl,
        sizeBytes: receipt.sizeBytes,
        sha256: receipt.sha256,
        signatureKeyId: receipt.signatureKeyId,
        provenance: receipt.provenance,
        licenseInventory: receipt.licenseInventory,
      });
      if (
        !sameStringSet(
          currentPackage.value.declaredPermissions,
          stagedPackage.value.declaredPermissions,
        )
      ) {
        await rm(extensionGrantPath(this.stateRoot, name), { force: true });
      }
      await rm(backupRoot, { recursive: true, force: false });
      targetMoved = false;
    } catch (error) {
      let recoveryError: unknown;
      try {
        if (candidateCommitted) await rm(target, { recursive: true, force: true });
        if (targetMoved) await rename(backupRoot, target);
        if (candidateCommitted) {
          await writeInstalledArtifactState(this.stateRoot, name, previousArtifact);
          if (entry.enabled) {
            await writeExtensionGrant(this.stateRoot, name, pluginId, entry.acceptedPermissions);
          } else {
            await rm(extensionGrantPath(this.stateRoot, name), { force: true });
          }
        }
      } catch (caught) {
        recoveryError = caught;
      }
      try {
        await this.artifactHost.discard(operationId);
      } catch (caught) {
        recoveryError =
          recoveryError === undefined
            ? caught
            : new AggregateError([recoveryError, caught], 'Extension update cleanup failed.');
      }
      if (recoveryError !== undefined) {
        throw new AggregateError(
          [error, recoveryError],
          `OpenNeko extension '${pluginId}' update and recovery failed.`,
        );
      }
      throw error;
    }
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
      throw new Error(`OpenNeko extension '${pluginId}' is not installed.`);
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
    await Promise.all([
      rm(extensionGrantPath(this.stateRoot, name), { force: true }),
      rm(extensionInstallStatePath(this.stateRoot, name), { force: true }),
    ]);
  }

  async reload(): Promise<void> {
    await this.read();
  }

  private initialize(): Promise<readonly AgentExtensionDiagnosticCode[]> {
    this.initialization ??= cleanupInterruptedArtifactStaging(this.installRoot);
    return this.initialization;
  }
}

async function cleanupInterruptedArtifactStaging(
  installRoot: string,
): Promise<readonly AgentExtensionDiagnosticCode[]> {
  let children;
  try {
    children = await readdir(installRoot, { withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) return [];
    throw error;
  }
  const cleanupResults = await Promise.allSettled(
    children
      .filter((child) =>
        /^\.artifact-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
          child.name,
        ),
      )
      .map((child) => rm(resolve(installRoot, child.name), { recursive: true, force: true })),
  );
  return cleanupResults.some((result) => result.status === 'rejected') ? ['repository_failed'] : [];
}

interface RepositoryPluginEntry {
  readonly pluginId: string;
  readonly name: string;
  readonly marketplace: typeof OPENNEKO_MARKETPLACE_ID;
  readonly version: string;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly acceptedPermissions: readonly string[];
  readonly authorityRoot: string;
  readonly sourcePath: string;
  readonly canInstall: boolean;
  readonly canRemove: boolean;
  readonly listed: boolean;
  readonly updatesFrom: readonly string[];
  readonly artifact?: AgentExtensionReviewedArtifact;
  readonly updateCandidate?: RepositoryUpdateCandidate;
  readonly installedArtifact?: InstalledArtifactState;
  readonly integrityDiagnostic?: AgentExtensionDiagnosticCode;
}

interface InstalledArtifactState {
  readonly pluginId: string;
  readonly packageRelease: string;
  readonly platform: AgentExtensionArtifactPlatform;
  readonly archive: AgentExtensionReviewedArtifact['archive'];
  readonly artifactUrl: string;
  readonly finalUrl: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly signatureKeyId: string;
  readonly provenance: AgentExtensionReviewedArtifact['provenance'];
  readonly licenseInventory: AgentExtensionReviewedArtifact['licenseInventory'];
}

interface RepositoryUpdateCandidate {
  readonly packageRelease: string;
  readonly authorityRoot: string;
  readonly sourcePath: string;
  readonly artifact: AgentExtensionReviewedArtifact;
}

interface VerifiedPlugin {
  readonly entry: RepositoryPluginEntry;
  readonly displayName: string;
  readonly description: string;
  readonly developer: string;
  readonly category: string;
  readonly iconDataUrl: string;
  readonly declaredPermissions: readonly string[];
  readonly runtime: AgentExtensionRuntimeDescriptor;
  readonly updatePackageRelease: string;
}

type ReadResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'error'; readonly code: AgentExtensionDiagnosticCode };

async function readMarketplaceEntries(
  marketplaceRoot: string,
  artifactHost: AgentExtensionArtifactHostPort,
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
    entries: definitions.map((definition) => {
      const artifact = definition.artifacts.find((candidate) =>
        sameArtifactPlatform(candidate.platform, artifactHost.platform),
      );
      const installable =
        definition.availability === 'installable' &&
        artifactHost.available &&
        artifact !== undefined;
      return createRepositoryEntry({
        name: definition.name,
        version: definition.version,
        authorityRoot: marketplaceRoot,
        sourcePath: resolve(marketplaceRoot, definition.path),
        installed: false,
        installable,
        listed: !installable,
        updatesFrom: definition.updatesFrom,
        ...(artifact === undefined ? {} : { artifact }),
      });
    }),
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
    const installedArtifact = await readInstalledArtifactState(stateRoot, child.name);
    if (!identity || identity.name !== child.name) {
      const grant = await readExtensionGrant(stateRoot, child.name);
      if (grant.diagnostic) diagnostics.push(grant.diagnostic);
      entries.push(
        createRepositoryEntry({
          name: child.name,
          version: identity?.version ?? '',
          authorityRoot: installRoot,
          sourcePath: pluginRoot,
          installed: true,
          enabled: grant.enabled,
          acceptedPermissions: grant.acceptedPermissions,
          ...(installedArtifact.value === undefined
            ? {}
            : { installedArtifact: installedArtifact.value }),
          ...(installedArtifact.diagnostic === undefined
            ? {}
            : { integrityDiagnostic: installedArtifact.diagnostic }),
        }),
      );
      continue;
    }
    const grant = await readExtensionGrant(stateRoot, identity.name);
    if (grant.diagnostic) diagnostics.push(grant.diagnostic);
    const integrityDiagnostic =
      installedArtifact.diagnostic ??
      (installedArtifact.value?.packageRelease === identity.version ? undefined : 'state_invalid');
    entries.push(
      createRepositoryEntry({
        name: identity.name,
        version: identity.version,
        authorityRoot: installRoot,
        sourcePath: pluginRoot,
        installed: true,
        enabled: grant.enabled,
        acceptedPermissions: grant.acceptedPermissions,
        ...(installedArtifact.value === undefined
          ? {}
          : { installedArtifact: installedArtifact.value }),
        ...(integrityDiagnostic === undefined ? {} : { integrityDiagnostic }),
      }),
    );
  }
  return { entries, diagnostics };
}

async function readInstalledArtifactState(
  stateRoot: string,
  name: string,
): Promise<{
  readonly value?: InstalledArtifactState;
  readonly diagnostic?: AgentExtensionDiagnosticCode;
}> {
  const pluginId = `${name}@${OPENNEKO_MARKETPLACE_ID}`;
  const result = await readJsonFile(extensionInstallStatePath(stateRoot, name), stateRoot);
  if (result.status !== 'ok') return { diagnostic: 'state_invalid' };
  const value = result.value;
  if (
    !hasOnlyKeys(value, [
      'pluginId',
      'packageRelease',
      'platform',
      'archive',
      'artifactUrl',
      'finalUrl',
      'sizeBytes',
      'sha256',
      'signatureKeyId',
      'provenance',
      'licenseInventory',
    ]) ||
    value['pluginId'] !== pluginId ||
    !isNonEmptyString(value['packageRelease']) ||
    (value['archive'] !== 'zip' && value['archive'] !== 'tar.gz') ||
    !Number.isSafeInteger(value['sizeBytes']) ||
    (value['sizeBytes'] as number) <= 0 ||
    (value['sizeBytes'] as number) > MAX_ARTIFACT_BYTES ||
    !isSha256(value['sha256']) ||
    !isExtensionIdentifierValue(value['signatureKeyId'])
  ) {
    return { diagnostic: 'state_invalid' };
  }
  const platform = parseArtifactPlatform(value['platform']);
  const artifactUrl = parseReviewedHttpsUrl(value['artifactUrl']);
  const finalUrl = parseReviewedHttpsUrl(value['finalUrl']);
  const provenance = parseArtifactProvenance(value['provenance']);
  const licenseInventory = parseArtifactLicenseInventory(value['licenseInventory']);
  if (!platform || !artifactUrl || !finalUrl || !provenance || !licenseInventory) {
    return { diagnostic: 'state_invalid' };
  }
  return {
    value: Object.freeze({
      pluginId,
      packageRelease: value['packageRelease'],
      platform,
      archive: value['archive'],
      artifactUrl: artifactUrl.href,
      finalUrl: finalUrl.href,
      sizeBytes: value['sizeBytes'] as number,
      sha256: value['sha256'],
      signatureKeyId: value['signatureKeyId'],
      provenance,
      licenseInventory,
    }),
  };
}

async function writeInstalledArtifactState(
  stateRoot: string,
  name: string,
  state: InstalledArtifactState,
): Promise<void> {
  await mkdir(stateRoot, { recursive: true });
  const target = extensionInstallStatePath(stateRoot, name);
  const staging = `${target}.staging-${randomUUID()}`;
  try {
    await writeFile(staging, JSON.stringify(state), { encoding: 'utf8', flag: 'wx' });
    await rename(staging, target);
  } finally {
    await rm(staging, { force: true });
  }
}

async function writeExtensionGrant(
  stateRoot: string,
  name: string,
  pluginId: string,
  acceptedPermissions: readonly string[],
): Promise<void> {
  await mkdir(stateRoot, { recursive: true });
  const grantPath = extensionGrantPath(stateRoot, name);
  const staging = `${grantPath}.staging-${randomUUID()}`;
  try {
    await writeFile(
      staging,
      JSON.stringify({
        pluginId,
        acceptedPermissions: [...acceptedPermissions].sort(),
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
  readonly acceptedPermissions: readonly string[];
  readonly diagnostic?: AgentExtensionDiagnosticCode;
}> {
  const pluginId = `${name}@${OPENNEKO_MARKETPLACE_ID}`;
  const result = await readJsonFile(extensionGrantPath(stateRoot, name), stateRoot);
  if (result.status === 'missing') {
    return { enabled: false, acceptedPermissions: [] };
  }
  if (
    result.status === 'error' ||
    !hasOnlyKeys(result.value, ['pluginId', 'acceptedPermissions']) ||
    result.value['pluginId'] !== pluginId
  ) {
    return { enabled: false, acceptedPermissions: [], diagnostic: 'state_invalid' };
  }
  const acceptedPermissions = parsePermissionList(result.value['acceptedPermissions']);
  if (acceptedPermissions === undefined) {
    return { enabled: false, acceptedPermissions: [], diagnostic: 'state_invalid' };
  }
  return { enabled: true, acceptedPermissions };
}

function parseMarketplaceIndex(value: Record<string, unknown>):
  | readonly {
      readonly name: string;
      readonly version: string;
      readonly path: string;
      readonly availability: 'installable' | 'unavailable';
      readonly artifacts: readonly AgentExtensionReviewedArtifact[];
      readonly updatesFrom: readonly string[];
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
    availability: 'installable' | 'unavailable';
    artifacts: readonly AgentExtensionReviewedArtifact[];
    updatesFrom: readonly string[];
  }[] = [];
  const ids = new Set<string>();
  for (const item of value['plugins']) {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(
        item,
        ['name', 'version', 'path'],
        ['availability', 'artifacts', 'updatesFrom'],
      ) ||
      !isPluginSegmentValue(item['name']) ||
      !isNonEmptyString(item['version']) ||
      !isNonEmptyString(item['path']) ||
      isAbsolute(item['path']) ||
      (item['availability'] !== undefined &&
        item['availability'] !== 'installable' &&
        item['availability'] !== 'unavailable')
    ) {
      return undefined;
    }
    const artifacts = parseReviewedArtifacts(item['artifacts']);
    const updatesFrom = parsePackageReleaseSet(item['updatesFrom']);
    if (!artifacts || !updatesFrom || updatesFrom.includes(item['version'])) return undefined;
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
    const availability = item['availability'] ?? 'installable';
    if (availability === 'installable' && artifacts.length === 0) return undefined;
    records.push({
      name: item['name'],
      version: item['version'],
      path: item['path'],
      availability,
      artifacts,
      updatesFrom,
    });
  }
  records.sort((left, right) => left.name.localeCompare(right.name));
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

function parseReviewedArtifacts(
  value: unknown,
): readonly AgentExtensionReviewedArtifact[] | undefined {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) return undefined;
  const artifacts: AgentExtensionReviewedArtifact[] = [];
  const platforms = new Set<string>();
  for (const item of value) {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, [
        'platform',
        'archive',
        'url',
        'allowedHosts',
        'sizeBytes',
        'sha256',
        'signature',
        'provenance',
        'licenseInventory',
      ])
    ) {
      return undefined;
    }
    const platform = parseArtifactPlatform(item['platform']);
    const url = parseReviewedHttpsUrl(item['url']);
    const allowedHosts = parseArtifactHosts(item['allowedHosts']);
    const signature = parseArtifactSignature(item['signature']);
    const provenance = parseArtifactProvenance(item['provenance']);
    const licenseInventory = parseArtifactLicenseInventory(item['licenseInventory']);
    if (
      !platform ||
      !url ||
      !allowedHosts ||
      !allowedHosts.includes(url.hostname) ||
      (item['archive'] !== 'zip' && item['archive'] !== 'tar.gz') ||
      !Number.isSafeInteger(item['sizeBytes']) ||
      (item['sizeBytes'] as number) <= 0 ||
      (item['sizeBytes'] as number) > MAX_ARTIFACT_BYTES ||
      !isSha256(item['sha256']) ||
      !signature ||
      !provenance ||
      !licenseInventory
    ) {
      return undefined;
    }
    const platformKey = `${platform.os}:${platform.arch}`;
    if (platforms.has(platformKey)) return undefined;
    platforms.add(platformKey);
    artifacts.push(
      Object.freeze({
        platform,
        archive: item['archive'],
        url: url.href,
        allowedHosts,
        sizeBytes: item['sizeBytes'] as number,
        sha256: item['sha256'],
        signature,
        provenance,
        licenseInventory,
      }),
    );
  }
  return Object.freeze(artifacts);
}

function parsePackageReleaseSet(value: unknown): readonly string[] | undefined {
  if (value === undefined) return Object.freeze([]);
  if (
    !Array.isArray(value) ||
    value.some((item) => !isNonEmptyString(item)) ||
    new Set(value).size !== value.length
  ) {
    return undefined;
  }
  return Object.freeze([...value].sort());
}

function parseArtifactPlatform(value: unknown): AgentExtensionArtifactPlatform | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['os', 'arch'])) return undefined;
  if (
    (value['os'] !== 'darwin' && value['os'] !== 'win32') ||
    (value['arch'] !== 'arm64' && value['arch'] !== 'x64')
  ) {
    return undefined;
  }
  return Object.freeze({ os: value['os'], arch: value['arch'] });
}

function parseArtifactHosts(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const hosts: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return undefined;
    let parsed: URL;
    try {
      parsed = new URL(`https://${item}`);
    } catch {
      return undefined;
    }
    if (
      item !== item.toLowerCase() ||
      parsed.hostname !== item.toLowerCase() ||
      parsed.host !== parsed.hostname ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      return undefined;
    }
    hosts.push(parsed.hostname);
  }
  if (new Set(hosts).size !== hosts.length) return undefined;
  return Object.freeze(hosts.sort());
}

function parseArtifactSignature(
  value: unknown,
): AgentExtensionReviewedArtifact['signature'] | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['algorithm', 'keyId', 'value'])) {
    return undefined;
  }
  if (
    value['algorithm'] !== 'ed25519' ||
    typeof value['keyId'] !== 'string' ||
    !isExtensionIdentifier(value['keyId']) ||
    typeof value['value'] !== 'string' ||
    !/^[A-Za-z0-9+/]{80,}={0,2}$/u.test(value['value'])
  ) {
    return undefined;
  }
  return Object.freeze({
    algorithm: 'ed25519',
    keyId: value['keyId'],
    value: value['value'],
  });
}

function parseArtifactProvenance(
  value: unknown,
): AgentExtensionReviewedArtifact['provenance'] | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['sourceRepository', 'sourceCommit', 'buildRecipeSha256'])
  ) {
    return undefined;
  }
  const repository = parseReviewedHttpsUrl(value['sourceRepository']);
  if (
    !repository ||
    typeof value['sourceCommit'] !== 'string' ||
    !/^[0-9a-f]{40}$/u.test(value['sourceCommit']) ||
    !isSha256(value['buildRecipeSha256'])
  ) {
    return undefined;
  }
  return Object.freeze({
    sourceRepository: repository.href,
    sourceCommit: value['sourceCommit'],
    buildRecipeSha256: value['buildRecipeSha256'],
  });
}

function parseArtifactLicenseInventory(
  value: unknown,
): AgentExtensionReviewedArtifact['licenseInventory'] | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['path', 'sha256'])) return undefined;
  if (
    typeof value['path'] !== 'string' ||
    !isSafePackageRelativePath(value['path']) ||
    !isSha256(value['sha256'])
  ) {
    return undefined;
  }
  return Object.freeze({ path: value['path'], sha256: value['sha256'] });
}

async function validateArtifactStageReceipt(input: {
  readonly receipt: AgentExtensionArtifactStageReceipt;
  readonly operationId: string;
  readonly pluginId: string;
  readonly packageRelease: string;
  readonly artifact: AgentExtensionReviewedArtifact;
  readonly installRoot: string;
  readonly stagingRoot: string;
}): Promise<void> {
  const { receipt, artifact } = input;
  const finalUrl = parseReviewedHttpsUrl(receipt.finalUrl);
  if (
    receipt.operationId !== input.operationId ||
    receipt.pluginId !== input.pluginId ||
    receipt.packageRelease !== input.packageRelease ||
    receipt.artifactUrl !== artifact.url ||
    !finalUrl ||
    !artifact.allowedHosts.includes(finalUrl.hostname) ||
    receipt.sizeBytes !== artifact.sizeBytes ||
    receipt.sha256 !== artifact.sha256 ||
    receipt.signatureKeyId !== artifact.signature.keyId ||
    receipt.signatureVerified !== true ||
    !sameArtifactProvenance(receipt.provenance, artifact.provenance) ||
    !sameLicenseInventory(receipt.licenseInventory, artifact.licenseInventory) ||
    resolve(receipt.stagingRoot) !== input.stagingRoot
  ) {
    throw new Error(`OpenNeko extension '${input.pluginId}' artifact receipt is invalid.`);
  }
  const [canonicalInstallRoot, canonicalStagingRoot, info] = await Promise.all([
    realpath(input.installRoot),
    realpath(receipt.stagingRoot),
    lstat(receipt.stagingRoot),
  ]);
  if (
    !isInsideOrEqual(canonicalInstallRoot, canonicalStagingRoot) ||
    canonicalInstallRoot === canonicalStagingRoot ||
    !info.isDirectory() ||
    info.isSymbolicLink()
  ) {
    throw new Error(`OpenNeko extension '${input.pluginId}' artifact staging is invalid.`);
  }
}

function sameArtifactPlatform(
  left: AgentExtensionArtifactPlatform,
  right: AgentExtensionArtifactPlatform,
): boolean {
  return left.os === right.os && left.arch === right.arch;
}

function sameArtifactProvenance(
  left: AgentExtensionReviewedArtifact['provenance'],
  right: AgentExtensionReviewedArtifact['provenance'],
): boolean {
  return (
    left.sourceRepository === right.sourceRepository &&
    left.sourceCommit === right.sourceCommit &&
    left.buildRecipeSha256 === right.buildRecipeSha256
  );
}

function sameLicenseInventory(
  left: AgentExtensionReviewedArtifact['licenseInventory'],
  right: AgentExtensionReviewedArtifact['licenseInventory'],
): boolean {
  return left.path === right.path && left.sha256 === right.sha256;
}

function parseReviewedHttpsUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.hash ||
      parsed.hostname !== parsed.hostname.toLowerCase() ||
      parsed.href !== value
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function isSafePackageRelativePath(value: string): boolean {
  if (!value || isAbsolute(value) || value.includes('\\') || value.includes('\0')) return false;
  const normalized = relative('.', value);
  return normalized !== '.' && !normalized.startsWith('..') && !isAbsolute(normalized);
}

function createRepositoryEntry(input: {
  readonly name: string;
  readonly version: string;
  readonly authorityRoot: string;
  readonly sourcePath: string;
  readonly installed: boolean;
  readonly enabled?: boolean;
  readonly acceptedPermissions?: readonly string[];
  readonly installable?: boolean;
  readonly listed?: boolean;
  readonly updatesFrom?: readonly string[];
  readonly artifact?: AgentExtensionReviewedArtifact;
  readonly installedArtifact?: InstalledArtifactState;
  readonly integrityDiagnostic?: AgentExtensionDiagnosticCode;
}): RepositoryPluginEntry {
  return Object.freeze({
    pluginId: `${input.name}@${OPENNEKO_MARKETPLACE_ID}`,
    name: input.name,
    marketplace: OPENNEKO_MARKETPLACE_ID,
    version: input.version,
    installed: input.installed,
    enabled: input.enabled ?? false,
    acceptedPermissions: Object.freeze([...(input.acceptedPermissions ?? [])]),
    authorityRoot: resolve(input.authorityRoot),
    sourcePath: resolve(input.sourcePath),
    canInstall: !input.installed && (input.installable ?? true),
    canRemove: input.installed && input.enabled !== true,
    listed: input.listed ?? false,
    updatesFrom: Object.freeze([...(input.updatesFrom ?? [])]),
    ...(input.artifact === undefined ? {} : { artifact: input.artifact }),
    ...(input.installedArtifact === undefined
      ? {}
      : { installedArtifact: input.installedArtifact }),
    ...(input.integrityDiagnostic === undefined
      ? {}
      : { integrityDiagnostic: input.integrityDiagnostic }),
  });
}

function parsePermissionList(value: unknown): readonly string[] | undefined {
  if (value === undefined) return Object.freeze([]);
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !isExtensionIdentifier(item)) ||
    new Set(value).size !== value.length
  ) {
    return undefined;
  }
  return Object.freeze([...value].sort());
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
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
  const author = optionalRecord(manifest['author']);
  const declaredPermissions = parsePermissionList(manifest['permissions']);
  const mcpToolExposure = manifest['mcpToolExposure'];
  if (
    interfaceMetadata === null ||
    author === null ||
    declaredPermissions === undefined ||
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
      developer: interfaceMetadata?.['developerName'] ?? author?.['name'] ?? '',
      category: interfaceMetadata?.['category'] ?? '',
      iconDataUrl: icon.value,
      declaredPermissions,
      updatePackageRelease: '',
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
  const projectedArtifact =
    entry.updateCandidate?.artifact ?? entry.artifact ?? entry.installedArtifact;
  let agentStatus: AgentExtensionStatus;
  let runtimeDiagnosticCode: string;
  if (!entry.installed) {
    agentStatus = entry.canInstall ? 'not-installed' : 'unsupported';
    runtimeDiagnosticCode = entry.canInstall ? '' : 'artifact-unavailable';
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
    version: entry.version,
    developer: plugin.developer,
    marketplace: entry.marketplace,
    category: plugin.category,
    installed: entry.installed,
    enabled: entry.enabled,
    canInstall: entry.canInstall,
    canUpdate: entry.installed && !entry.enabled && plugin.updatePackageRelease.length > 0,
    canEnable: entry.installed && !entry.enabled,
    canDisable: entry.installed && entry.enabled,
    canRemove: entry.canRemove,
    updatePackageRelease: plugin.updatePackageRelease,
    artifactPlatform: projectedArtifact
      ? `${projectedArtifact.platform.os}-${projectedArtifact.platform.arch}`
      : '',
    downloadSizeBytes: projectedArtifact?.sizeBytes ?? 0,
    artifactStatus: entry.installed ? 'installed' : entry.canInstall ? 'available' : 'unavailable',
    dependencyStatus: readiness?.dependencyStatus ?? 'unchecked',
    enableGrantStatus:
      plugin.declaredPermissions.length === 0
        ? 'not-required'
        : entry.enabled
          ? 'accepted'
          : 'required',
    hostPermissionStatus: readiness?.hostPermissionStatus ?? 'unknown',
    qualificationStatus: readiness?.qualificationStatus ?? 'unqualified',
    declaredPermissions: plugin.declaredPermissions,
    acceptedPermissions: entry.acceptedPermissions,
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
    version: entry.version,
    developer: '',
    marketplace: entry.marketplace,
    category: '',
    installed: true,
    enabled: entry.enabled,
    canInstall: false,
    canUpdate: false,
    canEnable: false,
    canDisable: entry.enabled,
    canRemove: !entry.enabled,
    updatePackageRelease: '',
    artifactPlatform: '',
    downloadSizeBytes: 0,
    artifactStatus: 'invalid',
    dependencyStatus: 'error',
    enableGrantStatus: entry.acceptedPermissions.length > 0 ? 'accepted' : 'required',
    hostPermissionStatus: 'unknown',
    qualificationStatus: 'failed',
    declaredPermissions: entry.acceptedPermissions,
    acceptedPermissions: entry.acceptedPermissions,
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

async function assertPackageTree(pluginRoot: string): Promise<void> {
  let fileCount = 0;
  let byteCount = 0;
  const pending = [pluginRoot];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) throw new Error('OpenNeko extension package traversal failed.');
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children) {
      const target = resolve(directory, child.name);
      if (!isInsideOrEqual(pluginRoot, target) || child.isSymbolicLink()) {
        throw new Error('OpenNeko extension package contains an unsafe path.');
      }
      fileCount += 1;
      if (fileCount > MAX_PACKAGE_FILES) {
        throw new Error('OpenNeko extension package contains too many files.');
      }
      if (child.isDirectory()) {
        pending.push(target);
        continue;
      }
      if (!child.isFile()) {
        throw new Error('OpenNeko extension package contains an unsupported file type.');
      }
      byteCount += (await lstat(target)).size;
      if (byteCount > MAX_PACKAGE_BYTES) {
        throw new Error('OpenNeko extension package is too large.');
      }
    }
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
  if (left.installed !== right.installed) return left.installed ? -1 : 1;
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

function extensionInstallStatePath(stateRoot: string, name: string): string {
  if (!isPluginSegment(name)) throw new Error('OpenNeko extension install identity is invalid.');
  const path = resolve(stateRoot, `${name}.install.json`);
  if (!isInsideOrEqual(stateRoot, path)) {
    throw new Error('OpenNeko extension install state path escaped its root.');
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

function isExtensionIdentifierValue(value: unknown): value is string {
  return typeof value === 'string' && isExtensionIdentifier(value);
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isEnoent(error)) return false;
    throw error;
  }
}
