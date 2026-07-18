import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type {
  CharacterRecord,
  CharacterRegistryFile,
  CreativeEntityChangeEvent,
  CreativeEntityKind,
  CreativeEntityRef,
  EntityBindingWidgetTriggerRequest,
  EntityAssetBinding,
  EntityFacadeAssetReverseLookupRequest,
  EntityFacadeAliasRequest,
  EntityFacadeBindingLifecycleRequest,
  EntityFacadeCandidateActionRequest,
  EntityFacadeConfirmCandidateRequest,
  EntityFacadeGetEntityDetailRequest,
  EntityFacadeGetEntityRequest,
  EntityFacadeListBindingsRequest,
  EntityFacadeListCandidatesRequest,
  EntityFacadeListEntitiesRequest,
  EntityFacadeMergeCandidateRequest,
  EntityFacadeNameCandidateRequest,
  EntityFacadeProposeCandidateRequest,
  EntityFacadeProjectContext,
  EntityFacadeRenameEntityRequest,
  EntityFacadeResolveByNameRequest,
  EntityFacadeSetDefaultBindingRequest,
  EntityFacadeUnbindAssetRequest,
  EntityFacadeUpdateMetadataRequest,
  EntityFacadeUpsertBindingRequest,
  EntityFacadeUpsertVisualDraftRequest,
  EntityMemoryContribution,
  EntityAssetProjectionRepository,
  LocalMetadataPartition,
} from '@neko/shared';
import {
  ENTITY_FACADE_COMMANDS,
  ENTITY_FACADE_SHORT_METADATA_KEYS,
  createEmptyCharacterRegistryFile,
  isEntityBindingWidgetTriggerRequest,
  isEntityFacadeAssetReverseLookupRequest,
  isEntityFacadeAliasRequest,
  isEntityFacadeBindingLifecycleRequest,
  isEntityFacadeCandidateActionRequest,
  isEntityFacadeConfirmCandidateRequest,
  isEntityFacadeGetEntityDetailRequest,
  isEntityFacadeGetEntityRequest,
  isEntityFacadeListBindingsRequest,
  isEntityFacadeListCandidatesRequest,
  isEntityFacadeListEntitiesRequest,
  isEntityFacadeMergeCandidateRequest,
  isEntityFacadeNameCandidateRequest,
  isEntityFacadeProposeCandidateRequest,
  isEntityFacadeRenameEntityRequest,
  isEntityFacadeResolveByNameRequest,
  isEntityFacadeSetDefaultBindingRequest,
  isEntityFacadeUnbindAssetRequest,
  isEntityFacadeUpdateMetadataRequest,
  isEntityFacadeUpsertBindingRequest,
  isEntityFacadeUpsertVisualDraftRequest,
  isEntityMemoryContribution,
} from '@neko/shared';
import { CreativeEntityService } from '../core/CreativeEntityService';
import {
  EntityContributionAutomationService,
  type EntityContributionAutomationOptions,
  type EntityContributionAutomationResult,
} from '../core/contributionAutomation';
import {
  EntityAssetBindingService,
  EntityAssetRequirementService,
  VisualIdentityDraftService,
} from '../core/factStores';
import { EntityAssetMetadataProjector, projectEntityBindingAvailability } from '../projections';
import { CreativeEntityRegistryService, ProjectEntityStore } from '../core/entityStore';
import type { EntityRuntimeFileStore, EntityRuntimePorts } from '../core/ports';
import { SerialEntityRuntimeLock } from '../core/ports';
import { resolveCharacterRegistryPath } from '../core/paths';
import {
  CommandProjectAssetRefResolver,
  ProjectAssetBindingAvailabilityWatcher,
} from './projectAssetBindingAvailabilityWatcher';

export {
  EntityInspectorProvider,
  isInspectorChangeRelated,
  toInspectorEntityRef,
  type EntityInspectorChangeSubscriber,
  type EntityInspectorCommandExecutor,
  type EntityInspectorProviderOptions,
} from './entityInspectorProvider';

export class NodeJsonEntityFileStore implements EntityRuntimeFileStore {
  async readJson(filePath: string): Promise<unknown | undefined> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }

  async writeJson(filePath: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(tmpPath, filePath);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export class CharacterRegistryService {
  private readonly ports: EntityRuntimePorts;
  private readonly store: ProjectEntityStore;

  constructor(
    private readonly filePath: string,
    ports?: EntityRuntimePorts,
  ) {
    this.ports = ports ?? createVSCodeEntityPorts();
    this.store = new ProjectEntityStore({
      projectRoot: path.dirname(filePath),
      ports: this.ports,
    });
  }

  async load(): Promise<CharacterRegistryFile> {
    return this.store.loadCharacters();
  }

  async save(registry: CharacterRegistryFile): Promise<void> {
    await this.ports.files.writeJson(this.filePath, registry);
  }

  async list(): Promise<readonly CharacterRecord[]> {
    return (await this.load()).characters;
  }

  async getById(id: string): Promise<CharacterRecord | undefined> {
    return (await this.load()).characters.find((record) => record.id === id);
  }

  async resolveByName(name: string): Promise<CharacterRecord | undefined> {
    return this.store.resolveCharacterRecordByName(name);
  }

  async resolveIds(names: readonly string[]): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};
    for (const name of names) {
      const record = await this.resolveByName(name);
      if (record) {
        resolved[name] = record.id;
      }
    }
    return resolved;
  }

  async upsert(record: CharacterRecord): Promise<CharacterRegistryFile> {
    const registry = await this.load();
    const next = {
      version: 1 as const,
      characters: [
        ...registry.characters.filter((candidate) => candidate.id !== record.id),
        record,
      ].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName) || a.id.localeCompare(b.id)),
    };
    await this.save(next);
    return next;
  }

  async remove(id: string): Promise<CharacterRegistryFile> {
    const registry = await this.load();
    const next = {
      version: 1 as const,
      characters: registry.characters.filter((record) => record.id !== id),
    };
    await this.save(next);
    return next;
  }
}

export interface VSCodeEntityRuntimeOptions {
  readonly projectRoot: string;
  readonly logger?: {
    warn(message: string, metadata?: Record<string, unknown>): void;
    info?(message: string, metadata?: Record<string, unknown>): void;
    error?(message: string, metadata?: Record<string, unknown>): void;
  };
  readonly projection?: {
    readonly repository: EntityAssetProjectionRepository;
    readonly partition: LocalMetadataPartition;
    readonly markStale?: (diagnostic: string, updatedAt: string) => Promise<unknown>;
  };
}

export interface VSCodeEntityCommandOptions {
  readonly projectRoot?: string;
  readonly logger?: VSCodeEntityRuntimeOptions['logger'];
  readonly runtimeRegistry?: VSCodeEntityRuntimeRegistry;
}

export interface VSCodeEntityContributionAutomationCommandOptions extends VSCodeEntityCommandOptions {
  readonly automation?: EntityContributionAutomationOptions;
}

export interface VSCodeEntityFacadeCommandOptions extends VSCodeEntityCommandOptions {
  readonly inputBox?: Pick<typeof vscode.window, 'showInputBox'>;
  readonly quickPick?: Pick<typeof vscode.window, 'showQuickPick'>;
  readonly executeCommand?: typeof vscode.commands.executeCommand;
}

export interface VSCodeEntityContributionAutomationRequest {
  readonly projectRoot?: string;
  readonly contribution: EntityMemoryContribution;
  readonly options?: EntityContributionAutomationOptions;
}

export interface VSCodeEntityRuntime {
  readonly service: CreativeEntityService;
  readonly ports: EntityRuntimePorts;
  readonly onDidChangeEntity: vscode.Event<CreativeEntityChangeEvent>;
  flushProjection(): Promise<void>;
  dispose(): void;
}

export interface VSCodeEntityRuntimeRegistryOptions extends Pick<
  VSCodeEntityRuntimeOptions,
  'logger'
> {
  readonly createRuntime?: (options: VSCodeEntityRuntimeOptions) => VSCodeEntityRuntime;
  readonly resolveProjection?: (
    projectRoot: string,
  ) => VSCodeEntityRuntimeOptions['projection'] | undefined;
}

export class VSCodeEntityRuntimeRegistry implements vscode.Disposable {
  private readonly runtimes = new Map<string, VSCodeEntityRuntime>();

  constructor(private readonly options: VSCodeEntityRuntimeRegistryOptions = {}) {}

  get(projectRoot: string): VSCodeEntityRuntime {
    const current = this.runtimes.get(projectRoot);
    if (current) return current;
    const next = (this.options.createRuntime ?? createVSCodeEntityRuntime)({
      projectRoot,
      logger: this.options.logger,
      projection: this.options.resolveProjection?.(projectRoot),
    });
    this.runtimes.set(projectRoot, next);
    return next;
  }

  dispose(): void {
    for (const runtime of this.runtimes.values()) {
      runtime.dispose();
    }
    this.runtimes.clear();
  }
}

const defaultRuntimeRegistry = new VSCodeEntityRuntimeRegistry();

export function getVSCodeEntityRuntimeRegistry(): VSCodeEntityRuntimeRegistry {
  return defaultRuntimeRegistry;
}

export function createVSCodeEntityRuntime(
  options: VSCodeEntityRuntimeOptions,
): VSCodeEntityRuntime {
  const emitter = new vscode.EventEmitter<CreativeEntityChangeEvent>();
  const ports: EntityRuntimePorts = {
    files: new NodeJsonEntityFileStore(),
    lock: new SerialEntityRuntimeLock(),
    logger: options.logger,
    events: { emit: (event) => emitter.fire(event) },
  };
  const service = new CreativeEntityService({ projectRoot: options.projectRoot, ports });
  const projector = options.projection
    ? new EntityAssetMetadataProjector({
        partition: options.projection.partition,
        repository: options.projection.repository,
        listCandidates: () => service.listCandidates(),
        listBindings: () => service.bindings.list(),
      })
    : undefined;
  let projectionRefresh = Promise.resolve();
  const refreshProjection = (): void => {
    if (!projector || !options.projection) return;
    projectionRefresh = projectionRefresh.then(async () => {
      try {
        await projector.refreshFacts();
      } catch (error) {
        const updatedAt = new Date().toISOString();
        try {
          await options.projection?.markStale?.('entity-fact-projection-refresh-failed', updatedAt);
        } catch (markError) {
          options.logger?.warn('Failed to mark Entity/Asset projection stale', {
            error: markError instanceof Error ? markError.message : String(markError),
          });
        }
        options.logger?.warn('Entity/Asset projection refresh failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  };
  const projectionSubscription = projector ? emitter.event(refreshProjection) : undefined;
  refreshProjection();
  const bindingAvailabilityWatcher = new ProjectAssetBindingAvailabilityWatcher({
    projectRoot: options.projectRoot,
    service,
    resolver: new CommandProjectAssetRefResolver(),
  });
  return {
    service,
    ports,
    onDidChangeEntity: emitter.event,
    flushProjection: () => projectionRefresh,
    dispose() {
      projectionSubscription?.dispose();
      bindingAvailabilityWatcher.dispose();
      emitter.dispose();
    },
  };
}

export function createVSCodeEntityPorts(
  options: Pick<VSCodeEntityRuntimeOptions, 'logger'> = {},
): EntityRuntimePorts {
  return {
    files: new NodeJsonEntityFileStore(),
    lock: new SerialEntityRuntimeLock(),
    logger: options.logger,
  };
}

export function createVSCodeEntityServices(options: VSCodeEntityRuntimeOptions): {
  readonly ports: EntityRuntimePorts;
  readonly store: ProjectEntityStore;
  readonly registry: CreativeEntityRegistryService;
  readonly bindings: EntityAssetBindingService;
  readonly requirements: EntityAssetRequirementService;
  readonly drafts: VisualIdentityDraftService;
  readonly service: CreativeEntityService;
} {
  const ports = createVSCodeEntityPorts(options);
  const store = new ProjectEntityStore({ projectRoot: options.projectRoot, ports });
  const registry = new CreativeEntityRegistryService(store);
  const bindings = EntityAssetBindingService.fromProjectRoot(options.projectRoot, ports);
  const requirements = EntityAssetRequirementService.fromProjectRoot(options.projectRoot, ports);
  const drafts = VisualIdentityDraftService.fromProjectRoot(options.projectRoot, ports);
  const service = new CreativeEntityService({
    projectRoot: options.projectRoot,
    ports,
    store,
    bindings,
    requirements,
    drafts,
  });

  return {
    ports,
    store,
    registry,
    bindings,
    requirements,
    drafts,
    service,
  };
}

export function registerEntityFacadeCommands(
  options: VSCodeEntityFacadeCommandOptions = {},
): vscode.Disposable {
  const ownsRuntimeRegistry = !options.runtimeRegistry;
  const runtimeRegistry =
    options.runtimeRegistry ?? new VSCodeEntityRuntimeRegistry({ logger: options.logger });
  const inputBox = options.inputBox ?? vscode.window;
  const quickPick = options.quickPick ?? vscode.window;
  const executeCommand = options.executeCommand ?? vscode.commands.executeCommand;
  const disposables: vscode.Disposable[] = [
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.getEntity,
      async (request: EntityFacadeGetEntityRequest | unknown) => {
        if (!isEntityFacadeGetEntityRequest(request)) return invalidRequest('getEntity');
        const resolved = resolveRuntime(runtimeRegistry, request, request.entityRef, options);
        if ('code' in resolved) return resolved;
        const entityId = request.entityRef?.entityId ?? request.entityId;
        if (!entityId) return invalidRequest('getEntity requires entityRef or entityId.');
        return resolved.runtime.service.get(entityId);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.getEntityDetail,
      async (request: EntityFacadeGetEntityDetailRequest | unknown) => {
        if (!isEntityFacadeGetEntityDetailRequest(request))
          return invalidRequest('getEntityDetail');
        const resolved = resolveRuntime(runtimeRegistry, request, request.entityRef, options);
        if ('code' in resolved) return resolved;
        const [entity, candidates, bindings, visualDrafts] = await Promise.all([
          resolved.runtime.service.get(request.entityRef.entityId),
          resolved.runtime.service.listCandidates(),
          resolved.runtime.service.bindings.list(),
          resolved.runtime.service.drafts.list(),
        ]);
        return {
          entity,
          candidates: candidates.filter(
            (candidate) => candidate.resolvedEntityRef?.entityId === request.entityRef.entityId,
          ),
          bindings: bindings.filter(
            (binding) =>
              binding.entityId === request.entityRef.entityId &&
              binding.entityKind === request.entityRef.entityKind,
          ),
          visualDrafts:
            request.entityRef.entityKind === 'character'
              ? visualDrafts.filter((draft) => draft.characterId === request.entityRef.entityId)
              : [],
        };
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.listEntities,
      async (request: EntityFacadeListEntitiesRequest | unknown = {}) => {
        if (!isEntityFacadeListEntitiesRequest(request)) return invalidRequest('listEntities');
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.list(request.query ?? {});
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.listBindings,
      async (request: EntityFacadeListBindingsRequest | unknown = {}) => {
        if (!isEntityFacadeListBindingsRequest(request)) return invalidRequest('listBindings');
        const resolved = resolveRuntime(runtimeRegistry, request, request.entityRef, options);
        if ('code' in resolved) return resolved;
        const bindings = await resolved.runtime.service.bindings.list();
        return bindings.filter((binding) => {
          if (
            request.entityRef &&
            (binding.entityId !== request.entityRef.entityId ||
              binding.entityKind !== request.entityRef.entityKind)
          ) {
            return false;
          }
          if (request.assetRef && binding.assetRef !== request.assetRef) return false;
          return true;
        });
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.findEntitiesByAsset,
      async (request: EntityFacadeAssetReverseLookupRequest | unknown) => {
        if (!isEntityFacadeAssetReverseLookupRequest(request)) {
          return invalidRequest('findEntitiesByAsset');
        }
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        const bindings = await resolved.runtime.service.bindings.list();
        const matchedBindings = bindings.filter((binding) => binding.assetRef === request.assetRef);
        const entities = await Promise.all(
          matchedBindings.map(async (binding) => {
            const entity = await resolved.runtime.service.get(binding.entityId);
            return {
              entityRef: {
                entityId: binding.entityId,
                entityKind: binding.entityKind,
                projectRoot: resolved.projectRoot,
                source: 'neko-entity',
              },
              label: entity?.displayName ?? entity?.canonicalName ?? binding.entityId,
              role: binding.role,
              bindingId: binding.id,
              status: binding.status,
              availability: binding.availability,
              ...(binding.isDefault ? { isDefault: true } : {}),
            };
          }),
        );
        return {
          assetRef: request.assetRef,
          entities,
        };
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.resolveByName,
      async (request: EntityFacadeResolveByNameRequest | unknown) => {
        if (!isEntityFacadeResolveByNameRequest(request)) return invalidRequest('resolveByName');
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.resolveByName(request.name, request.kind);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.listCandidates,
      async (request: EntityFacadeListCandidatesRequest | unknown = {}) => {
        if (!isEntityFacadeListCandidatesRequest(request)) return invalidRequest('listCandidates');
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.listCandidates(request.status);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.proposeCandidate,
      async (request: EntityFacadeProposeCandidateRequest | unknown) => {
        if (!isEntityFacadeProposeCandidateRequest(request)) {
          return invalidRequest('proposeCandidate');
        }
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.proposeCandidate(request.candidate);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.confirmCandidate,
      async (request: EntityFacadeConfirmCandidateRequest | unknown) => {
        if (!isEntityFacadeConfirmCandidateRequest(request))
          return invalidRequest('confirmCandidate');
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.confirmCandidate(request);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.rejectCandidate,
      async (request: EntityFacadeCandidateActionRequest | unknown) => {
        if (!isEntityFacadeCandidateActionRequest(request))
          return invalidRequest('rejectCandidate');
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.rejectCandidate(request.candidateId);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.dismissCandidate,
      async (request: EntityFacadeCandidateActionRequest | unknown) => {
        if (!isEntityFacadeCandidateActionRequest(request))
          return invalidRequest('dismissCandidate');
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.dismissCandidate(request.candidateId);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.mergeCandidate,
      async (request: EntityFacadeMergeCandidateRequest | unknown) => {
        if (!isEntityFacadeMergeCandidateRequest(request)) return invalidRequest('mergeCandidate');
        const resolved = resolveRuntime(runtimeRegistry, request, request.entityRef, options);
        if ('code' in resolved) return resolved;
        const entityId = request.entityRef?.entityId ?? request.entityId;
        if (!entityId) return invalidRequest('mergeCandidate requires target entity.');
        return resolved.runtime.service.mergeCandidateIntoExisting({
          candidateId: request.candidateId,
          entityId,
          asAlias: request.asAlias,
        });
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.bindAsset,
      async (request: EntityFacadeUpsertBindingRequest | unknown) => {
        if (!isEntityFacadeUpsertBindingRequest(request)) return invalidRequest('bindAsset');
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.upsertBinding(request.binding);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.unbindAsset,
      async (request: EntityFacadeUnbindAssetRequest | unknown) => {
        if (!isEntityFacadeUnbindAssetRequest(request)) return invalidRequest('unbindAsset');
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.unbindAsset(request.bindingId);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.markBindingOrphaned,
      async (request: EntityFacadeBindingLifecycleRequest | unknown) => {
        if (!isEntityFacadeBindingLifecycleRequest(request)) {
          return invalidRequest('markBindingOrphaned');
        }
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.markBindingsOrphaned(request);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.restoreBinding,
      async (request: EntityFacadeBindingLifecycleRequest | unknown) => {
        if (!isEntityFacadeBindingLifecycleRequest(request))
          return invalidRequest('restoreBinding');
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.restoreOrphanedBindings(request);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.archiveBinding,
      async (request: EntityFacadeBindingLifecycleRequest | unknown) => {
        if (!isEntityFacadeBindingLifecycleRequest(request))
          return invalidRequest('archiveBinding');
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.archiveBindings(request);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.upsertVisualDraft,
      async (request: EntityFacadeUpsertVisualDraftRequest | unknown) => {
        if (!isEntityFacadeUpsertVisualDraftRequest(request))
          return invalidRequest('upsertVisualDraft');
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        return resolved.runtime.service.upsertVisualDraft(request.draft);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.nameCandidate,
      async (request: EntityFacadeNameCandidateRequest | unknown) => {
        if (!isEntityFacadeNameCandidateRequest(request)) return invalidRequest('nameCandidate');
        const resolved = resolveRuntime(runtimeRegistry, request, undefined, options);
        if ('code' in resolved) return resolved;
        try {
          return await resolved.runtime.service.nameCandidate(request);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to name candidate.';
          return message.includes('already exists')
            ? duplicateName(message)
            : invalidRequest(message);
        }
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.renameEntity,
      async (request: EntityFacadeRenameEntityRequest | unknown) => {
        if (!isEntityFacadeRenameEntityRequest(request)) return invalidRequest('renameEntity');
        const resolved = resolveRuntime(runtimeRegistry, request, request.entityRef, options);
        if ('code' in resolved) return resolved;
        const current = await resolved.runtime.service.get(request.entityRef.entityId);
        if (!current) return notFound('Entity not found.');
        const canonicalName =
          request.canonicalName ??
          (request.interactive
            ? await inputBox.showInputBox({
                title: vscode.l10n.t('Rename entity'),
                prompt: vscode.l10n.t('Enter a new entity name.'),
                value: current.canonicalName,
                validateInput: async (value) =>
                  (await validateRename(
                    resolved.runtime.service,
                    current.id,
                    current.kind,
                    value,
                  )) ?? undefined,
              })
            : undefined);
        if (canonicalName === undefined) return cancelled();
        const validation = await validateRename(
          resolved.runtime.service,
          current.id,
          current.kind,
          canonicalName,
        );
        if (validation) return duplicateName(validation);
        return resolved.runtime.service.renameEntity({
          entityId: current.id,
          canonicalName: canonicalName.trim(),
          keepPreviousAsAlias: request.keepPreviousAsAlias,
        });
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.addAlias,
      async (request: EntityFacadeAliasRequest | unknown) => {
        if (!isEntityFacadeAliasRequest(request)) return invalidRequest('addAlias');
        const resolved = resolveRuntime(runtimeRegistry, request, request.entityRef, options);
        if ('code' in resolved) return resolved;
        const alias =
          request.alias ??
          (request.interactive
            ? await inputBox.showInputBox({
                title: vscode.l10n.t('Add alias'),
                prompt: vscode.l10n.t('Enter an alias for this entity.'),
              })
            : undefined);
        if (alias === undefined) return cancelled();
        if (!alias.trim()) return invalidRequest('Alias cannot be empty.');
        return resolved.runtime.service.addAlias(request.entityRef.entityId, alias);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.removeAlias,
      async (request: EntityFacadeAliasRequest | unknown) => {
        if (!isEntityFacadeAliasRequest(request)) return invalidRequest('removeAlias');
        const resolved = resolveRuntime(runtimeRegistry, request, request.entityRef, options);
        if ('code' in resolved) return resolved;
        const entity = await resolved.runtime.service.get(request.entityRef.entityId);
        if (!entity) return notFound('Entity not found.');
        const alias =
          request.alias ??
          (request.interactive
            ? await quickPick.showQuickPick([...entity.aliases], {
                title: vscode.l10n.t('Remove alias'),
                placeHolder: vscode.l10n.t('Select an alias to remove.'),
              })
            : undefined);
        if (alias === undefined) return cancelled();
        if (!alias.trim()) return invalidRequest('Alias cannot be empty.');
        return resolved.runtime.service.removeAlias(entity.id, alias);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.updateMetadata,
      async (request: EntityFacadeUpdateMetadataRequest | unknown) => {
        if (!isEntityFacadeUpdateMetadataRequest(request)) {
          return isRecord(request) && isRecord(request['metadata'])
            ? unsupportedEdit('Quick Edit metadata only supports short appearance summary fields.')
            : invalidRequest('updateMetadata');
        }
        const resolved = resolveRuntime(runtimeRegistry, request, request.entityRef, options);
        if ('code' in resolved) return resolved;
        const metadata = buildShortMetadataPatch(request);
        if ('code' in metadata) return metadata;
        return resolved.runtime.service.updateMetadata(request.entityRef.entityId, metadata);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.setDefaultBinding,
      async (request: EntityFacadeSetDefaultBindingRequest | unknown) => {
        if (!isEntityFacadeSetDefaultBindingRequest(request))
          return invalidRequest('setDefaultBinding');
        const resolved = resolveRuntime(runtimeRegistry, request, request.entityRef, options);
        if ('code' in resolved) return resolved;
        const binding =
          request.binding ??
          (request.interactive && request.entityRef
            ? await pickDefaultBinding(resolved.runtime.service, request.entityRef, quickPick)
            : undefined);
        if (!binding) {
          return request.interactive
            ? cancelled()
            : invalidRequest('setDefaultBinding requires binding.');
        }
        return resolved.runtime.service.setDefaultBinding(binding);
      },
    ),
    vscode.commands.registerCommand(
      ENTITY_FACADE_COMMANDS.triggerBindingWidgetAction,
      async (request: EntityBindingWidgetTriggerRequest | unknown) => {
        if (!isEntityBindingWidgetTriggerRequest(request))
          return invalidRequest('triggerBindingWidgetAction');
        return executeWidgetAction(request, executeCommand);
      },
    ),
  ];
  return {
    dispose() {
      for (const disposable of disposables) {
        disposable.dispose();
      }
      if (ownsRuntimeRegistry) {
        runtimeRegistry.dispose();
      }
    },
  };
}

export function registerEntityContributionAutomationCommand(
  options: VSCodeEntityContributionAutomationCommandOptions = {},
) {
  const ownsRuntimeRegistry = !options.runtimeRegistry;
  const runtimeRegistry =
    options.runtimeRegistry ?? new VSCodeEntityRuntimeRegistry({ logger: options.logger });
  const command = vscode.commands.registerCommand(
    'neko.entity.processMemoryContribution',
    async (
      request: VSCodeEntityContributionAutomationRequest | unknown,
    ): Promise<EntityContributionAutomationResult | undefined> => {
      if (!isEntityContributionAutomationRequest(request)) {
        throw new Error('neko.entity.processMemoryContribution: invalid request');
      }
      const projectRoot =
        options.projectRoot ??
        request.projectRoot ??
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!projectRoot) {
        return undefined;
      }
      const runtime = runtimeRegistry.get(projectRoot);
      const automation = new EntityContributionAutomationService(runtime.service);
      return automation.processContribution(request.contribution, {
        ...options.automation,
        ...request.options,
      });
    },
  );
  return {
    dispose() {
      command.dispose();
      if (ownsRuntimeRegistry) {
        runtimeRegistry.dispose();
      }
    },
  };
}

function resolveRuntime(
  registry: VSCodeEntityRuntimeRegistry,
  request: EntityFacadeProjectContext,
  entityRef: Pick<CreativeEntityRef, 'projectRoot'> | undefined,
  options: VSCodeEntityCommandOptions,
):
  | { readonly projectRoot: string; readonly runtime: VSCodeEntityRuntime }
  | ReturnType<typeof missingProject> {
  const projectRoot =
    options.projectRoot ??
    request.projectRoot ??
    entityRef?.projectRoot ??
    projectRootFromContextUri(request.contextUri) ??
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!projectRoot) {
    return missingProject();
  }
  return { projectRoot, runtime: registry.get(projectRoot) };
}

async function validateRename(
  service: CreativeEntityService,
  currentEntityId: string,
  kind: CreativeEntityKind,
  canonicalName: string,
): Promise<string | undefined> {
  const trimmed = canonicalName.trim();
  if (!trimmed) {
    return 'Entity name cannot be empty.';
  }
  const existing = await service.resolveByName(trimmed, kind);
  if (existing && existing.id !== currentEntityId) {
    return `Another ${kind} entity already uses this name.`;
  }
  return undefined;
}

function buildShortMetadataPatch(
  request: EntityFacadeUpdateMetadataRequest,
): Record<string, unknown> | ReturnType<typeof unsupportedEdit> {
  const metadata: Record<string, unknown> = {};
  const allowed = new Set<string>(ENTITY_FACADE_SHORT_METADATA_KEYS);
  for (const [key, value] of Object.entries(request.metadata)) {
    if (!allowed.has(key)) {
      return unsupportedEdit(`Unsupported Quick Edit metadata field: ${key}`);
    }
    if (typeof value === 'string' && value.length > 500) {
      return unsupportedEdit(`Quick Edit metadata field is too long: ${key}`);
    }
    metadata[key] = value;
  }
  return metadata;
}

async function executeWidgetAction(
  request: EntityBindingWidgetTriggerRequest,
  executeCommand: typeof vscode.commands.executeCommand,
): Promise<unknown> {
  const context = widgetProjectContext(request);
  switch (request.action) {
    case 'confirm-candidate':
      if (!request.candidateId) return invalidRequest('Widget confirm requires candidateId.');
      return executeCommand(ENTITY_FACADE_COMMANDS.confirmCandidate, {
        ...context,
        candidateId: request.candidateId,
      });
    case 'bind-asset': {
      const entityRef = request.entityRef;
      const assetRef = request.assetRef ?? request.context.assetRef;
      if (!entityRef || !assetRef || !request.role) {
        return invalidRequest('Widget bind requires entityRef, assetRef, and role.');
      }
      return executeCommand(ENTITY_FACADE_COMMANDS.bindAsset, {
        ...context,
        binding: {
          id: buildWidgetBindingId(entityRef.entityId, request.role, assetRef),
          entityId: entityRef.entityId,
          entityKind: entityRef.entityKind,
          assetRef,
          role: request.role,
          status: 'confirmed',
          availability: 'active',
          source: 'user',
          updatedAt: new Date().toISOString(),
        },
      });
    }
    case 'unbind-asset':
      if (!request.payload || typeof request.payload['bindingId'] !== 'string') {
        return invalidRequest('Widget unbind requires payload.bindingId.');
      }
      return executeCommand(ENTITY_FACADE_COMMANDS.unbindAsset, {
        ...context,
        bindingId: request.payload['bindingId'],
      });
    case 'archive-binding':
      if (!request.payload || typeof request.payload['bindingId'] !== 'string') {
        return invalidRequest('Widget archive requires payload.bindingId.');
      }
      return executeCommand(ENTITY_FACADE_COMMANDS.archiveBinding, {
        ...context,
        bindingIds: [request.payload['bindingId']],
      });
    case 'name-candidate':
      if (!request.candidateId)
        return invalidRequest('Widget name candidate requires candidateId.');
      if (typeof request.payload?.['name'] !== 'string') {
        return invalidRequest('Widget name candidate requires payload.name.');
      }
      return executeCommand(ENTITY_FACADE_COMMANDS.nameCandidate, {
        ...context,
        candidateId: request.candidateId,
        name: request.payload['name'],
        aliases: readStringArrayPayload(request.payload, 'aliases'),
      });
    case 'rename-entity':
      if (!request.entityRef) return invalidRequest('Widget rename requires entityRef.');
      return executeCommand(ENTITY_FACADE_COMMANDS.renameEntity, {
        ...context,
        entityRef: request.entityRef,
        canonicalName: readStringPayload(request.payload, 'canonicalName'),
        interactive: request.payload?.['canonicalName'] === undefined,
        keepPreviousAsAlias: readBooleanPayload(request.payload, 'keepPreviousAsAlias'),
      });
    case 'add-alias':
      if (!request.entityRef) return invalidRequest('Widget add alias requires entityRef.');
      return executeCommand(ENTITY_FACADE_COMMANDS.addAlias, {
        ...context,
        entityRef: request.entityRef,
        alias: readStringPayload(request.payload, 'alias'),
        interactive: request.payload?.['alias'] === undefined,
      });
    case 'remove-alias':
      if (!request.entityRef) return invalidRequest('Widget remove alias requires entityRef.');
      return executeCommand(ENTITY_FACADE_COMMANDS.removeAlias, {
        ...context,
        entityRef: request.entityRef,
        alias: readStringPayload(request.payload, 'alias'),
        interactive: request.payload?.['alias'] === undefined,
      });
    case 'update-metadata':
      if (!request.entityRef) return invalidRequest('Widget metadata update requires entityRef.');
      return executeCommand(ENTITY_FACADE_COMMANDS.updateMetadata, {
        ...context,
        entityRef: request.entityRef,
        metadata: isRecord(request.payload?.['metadata'])
          ? request.payload?.['metadata']
          : (request.payload ?? {}),
      });
    case 'set-default-binding':
      if (!request.entityRef && !isRecord(request.payload?.['binding'])) {
        return invalidRequest('Widget default binding requires entityRef or payload.binding.');
      }
      return executeCommand(ENTITY_FACADE_COMMANDS.setDefaultBinding, {
        ...context,
        ...(request.entityRef ? { entityRef: request.entityRef } : {}),
        ...(isRecord(request.payload?.['binding']) ? { binding: request.payload['binding'] } : {}),
        interactive: request.payload?.['binding'] === undefined,
      });
  }
}

async function pickDefaultBinding(
  service: CreativeEntityService,
  entityRef: CreativeEntityRef,
  quickPick: Pick<typeof vscode.window, 'showQuickPick'>,
): Promise<EntityAssetBinding | undefined> {
  const bindings = (await service.bindings.list()).filter(
    (binding) =>
      binding.entityId === entityRef.entityId &&
      binding.entityKind === entityRef.entityKind &&
      binding.status !== 'rejected' &&
      binding.availability !== 'archived',
  );
  if (bindings.length === 0) return undefined;
  const picked = await quickPick.showQuickPick(
    bindings.map((binding) => {
      const projection = projectEntityBindingAvailability(binding);
      return {
        label: projection.label,
        description: projection.description,
        detail: projection.unavailable
          ? vscode.l10n.t(
              'Representation asset is unavailable; choosing it preserves the entity link but keeps the broken marker visible.',
            )
          : binding.assetRef,
        binding,
      };
    }),
    {
      title: vscode.l10n.t('Set default binding'),
      placeHolder: vscode.l10n.t('Select the representation to use as this entity default.'),
    },
  );
  return picked?.binding;
}

function widgetProjectContext(
  request: EntityBindingWidgetTriggerRequest,
): EntityFacadeProjectContext {
  return {
    projectRoot: request.projectRoot ?? request.context.projectRoot,
    contextUri: request.contextUri ?? request.context.contextUri,
  };
}

function projectRootFromContextUri(contextUri: string | undefined): string | undefined {
  if (!contextUri) return undefined;
  try {
    const uri = vscode.Uri.parse(contextUri);
    return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
  } catch {
    return undefined;
  }
}

function buildWidgetBindingId(entityId: string, role: string, assetRef: string): string {
  return `binding:${safeIdPart(entityId)}:${safeIdPart(role)}:${safeIdPart(assetRef)}`;
}

function safeIdPart(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_\-\p{Letter}\p{Number}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96);
}

function readStringPayload(
  payload: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = payload?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readBooleanPayload(
  payload: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = payload?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readStringArrayPayload(
  payload: Record<string, unknown> | undefined,
  key: string,
): readonly string[] | undefined {
  const value = payload?.[key];
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function invalidRequest(message: string) {
  return {
    code: 'invalid-request' as const,
    message,
  };
}

function missingProject() {
  return {
    code: 'missing-project' as const,
    message: 'Entity facade request requires an explicit project root or workspace context.',
  };
}

function notFound(message: string) {
  return {
    code: 'not-found' as const,
    message,
  };
}

function duplicateName(message: string) {
  return {
    code: 'duplicate-name' as const,
    message,
  };
}

function unsupportedEdit(message: string) {
  return {
    code: 'unsupported-edit' as const,
    message,
  };
}

function cancelled() {
  return {
    code: 'cancelled' as const,
    message: 'Entity Quick Edit was cancelled.',
  };
}

function isEntityContributionAutomationRequest(
  value: unknown,
): value is VSCodeEntityContributionAutomationRequest {
  if (!isRecord(value)) return false;
  return (
    (value['projectRoot'] === undefined || typeof value['projectRoot'] === 'string') &&
    isEntityMemoryContribution(value['contribution']) &&
    (value['options'] === undefined || isContributionAutomationOptions(value['options']))
  );
}

function isContributionAutomationOptions(
  value: unknown,
): value is EntityContributionAutomationOptions {
  if (!isRecord(value)) return false;
  return (
    (value['mode'] === undefined ||
      value['mode'] === 'match-only' ||
      value['mode'] === 'candidate' ||
      value['mode'] === 'confirm-source-approved') &&
    (value['defaultKind'] === undefined ||
      value['defaultKind'] === 'character' ||
      value['defaultKind'] === 'scene' ||
      value['defaultKind'] === 'object' ||
      value['defaultKind'] === 'location' ||
      value['defaultKind'] === 'style') &&
    (value['minimumCandidateConfidence'] === undefined ||
      isUnitNumber(value['minimumCandidateConfidence'])) &&
    (value['minimumAutoConfirmConfidence'] === undefined ||
      isUnitNumber(value['minimumAutoConfirmConfidence']))
  );
}

function isUnitNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export { createEmptyCharacterRegistryFile, resolveCharacterRegistryPath };
export type {
  EntityAssetBindingService,
  EntityAssetRequirementService,
  VisualIdentityDraftService,
} from '../core/factStores';
export type { CreativeEntityRegistryService } from '../core/entityStore';
