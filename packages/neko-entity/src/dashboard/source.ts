import type {
  CharacterEvidenceLedgerStore,
  CharacterMemoryFile,
  CharacterMemoryReviewStatus,
  CharacterObservation,
  CreativeEntity,
  CreativeEntityCandidate,
  DashboardCreativeEntityActionRequest,
  DashboardCreativeEntityActionResult,
  DashboardCreativeEntityDetail,
  DashboardEntityMemoryReviewAction,
  DashboardEntityMemoryReviewItem,
  DashboardCreativeEntityEvent,
  DashboardCreativeEntityRef,
  DashboardCreativeEntityRow,
  DashboardCreativeEntitySnapshot,
  DashboardCreativeEntitySource,
  DashboardCharacterRoleWorkflowAction,
  EntityAssetBinding,
  EntityAssetRequirement,
  VisualIdentityDraft,
} from '@neko/shared';
import { updateCharacterObservationReviewStatus } from '@neko/shared';
import {
  isNpcTestMode,
  NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND,
  NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
  type NpcAgentWorkflowRequest,
  type NpcTestBenchLaunchRequest,
} from '@neko/shared/types/npc-test-bench';
import {
  DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION,
  isDashboardCharacterRoleWorkflowScopeRef,
} from '@neko/shared/types/dashboard-creative-entity';
import { DefaultAssetRefResolver } from '../core/assetRefs';
import type { CreativeEntityService } from '../core/CreativeEntityService';
import type { EntityDisposable } from '../core/ports';

const ASSET_REF_VALIDATOR = new DefaultAssetRefResolver();

export type EntityDashboardTranslate = (
  message: string,
  ...args: readonly (string | number | boolean)[]
) => string;

function defaultTranslate(
  message: string,
  ...args: readonly (string | number | boolean)[]
): string {
  return args.reduce<string>(
    (text, arg, index) => text.replace(new RegExp(`\\{${index}\\}`, 'g'), String(arg)),
    message,
  );
}

export interface EntityDashboardSourceOptions {
  readonly projectRoot: string;
  readonly service: Pick<
    CreativeEntityService,
    | 'list'
    | 'get'
    | 'listCandidates'
    | 'confirmCandidate'
    | 'rejectCandidate'
    | 'dismissCandidate'
    | 'mergeCandidateIntoExisting'
    | 'markBindingsOrphaned'
    | 'restoreOrphanedBindings'
    | 'archiveBindings'
    | 'upsertBinding'
    | 'renameEntity'
    | 'addAlias'
    | 'removeAlias'
    | 'deprecateEntity'
    | 'reactivateEntity'
    | 'bindings'
    | 'requirements'
    | 'drafts'
  >;
  readonly subscribe?: (
    listener: (event: DashboardCreativeEntityEvent) => void,
  ) => EntityDisposable;
  readonly characterMemory?: {
    readonly path: string;
    readonly store: CharacterEvidenceLedgerStore;
  };
  readonly executeCommand?: (command: string, ...args: unknown[]) => Promise<unknown>;
  readonly now?: () => string;
  readonly translate?: EntityDashboardTranslate;
}

type ReviewableCharacterObservation = CharacterObservation & {
  readonly reviewStatus: Exclude<CharacterMemoryReviewStatus, 'accepted'>;
};

export class EntityDashboardCreativeEntitySource implements DashboardCreativeEntitySource {
  readonly contractVersion = DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION;
  readonly source = 'neko-entity';
  readonly sourceDisplayName = 'Neko Entity';

  constructor(private readonly options: EntityDashboardSourceOptions) {}

  private get translate(): EntityDashboardTranslate {
    return this.options.translate ?? defaultTranslate;
  }

  get capabilities(): DashboardCreativeEntitySource['capabilities'] {
    const memoryActions: readonly DashboardEntityMemoryReviewAction[] = this.options.characterMemory
      ? [
          'accept-memory-review',
          'reject-memory-review',
          'mark-memory-conflict',
          'supersede-memory-review',
        ]
      : [];
    return {
      detail: true,
      syncSuggestions: true,
      ...(this.options.characterMemory ? { memoryReviews: true } : {}),
      actions: [
        'show-detail',
        'confirm-candidate',
        'edit-aliases',
        'bind-existing',
        'review-drafts',
        'handle-requirement',
        'generate-material',
        'import-material',
        'dismiss-requirement',
        'character-dialogue',
        'embody-character',
        ...memoryActions,
        'refresh',
      ],
    };
  }

  async getSnapshot(): Promise<DashboardCreativeEntitySnapshot> {
    const [entities, candidates, bindings, requirements, drafts] = await Promise.all([
      this.options.service.list(),
      this.options.service.listCandidates('open'),
      this.options.service.bindings.list(),
      this.options.service.requirements.list(),
      this.options.service.drafts.list(),
    ]);
    const rows = [
      ...entities.map((entity) =>
        projectEntityRow(entity, bindings, requirements, drafts, this.translate),
      ),
      ...candidates.map((candidate) => projectCandidateRow(candidate, this.translate)),
    ].sort(compareRows);
    const updatedAt = this.now();
    return {
      source: this.source,
      sourceDisplayName: this.sourceDisplayName,
      status: {
        source: this.source,
        sourceDisplayName: this.sourceDisplayName,
        available: true,
        freshness: 'fresh',
        entityCount: rows.length,
        updatedAt,
      },
      rows,
      freshness: 'fresh',
      updatedAt,
    };
  }

  async getDetail(
    ref: DashboardCreativeEntityRef,
  ): Promise<DashboardCreativeEntityDetail | undefined> {
    if (ref.source !== this.source) return undefined;
    if (ref.sourceEntityId.startsWith('candidate:')) {
      const candidate = (await this.options.service.listCandidates()).find(
        (item) => item.id === ref.sourceEntityId,
      );
      return candidate ? projectCandidateDetail(candidate, this.translate) : undefined;
    }

    const entityId = ref.entityId ?? ref.sourceEntityId.replace(/^entity:/, '');
    const entity = await this.options.service.get(entityId);
    if (!entity) return undefined;
    const [bindings, requirements, drafts] = await Promise.all([
      this.options.service.bindings.list(),
      this.options.service.requirements.list(),
      this.options.service.drafts.list(),
    ]);
    const memoryReviews = await this.projectMemoryReviews(entity);
    return projectEntityDetail(
      entity,
      bindings,
      requirements,
      drafts,
      memoryReviews,
      this.translate,
    );
  }

  async executeAction(
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    if (request.source !== this.source) {
      return {
        ok: false,
        message: this.translate('Unsupported source: {0}', request.source),
        ref: request.ref,
      };
    }
    const candidateId = request.ref?.sourceEntityId.startsWith('candidate:')
      ? request.ref.sourceEntityId
      : undefined;
    const entityId = request.ref?.entityId ?? request.ref?.sourceEntityId.replace(/^entity:/, '');

    try {
      switch (request.action) {
        case 'refresh':
        case 'show-detail':
          return { ok: true, refresh: true, ref: request.ref };
        case 'character-dialogue':
          return this.executeNpcTestAction(entityId, request);
        case 'embody-character':
          return this.executeNpcWorkflowAction(request.action, entityId, request);
        case 'accept-memory-review':
        case 'reject-memory-review':
        case 'mark-memory-conflict':
        case 'supersede-memory-review':
          return this.executeMemoryReviewAction(request.action, request);
        case 'confirm-candidate':
          if (!candidateId) {
            return {
              ok: false,
              message: this.translate('No candidate ref is available.'),
              ref: request.ref,
            };
          }
          await this.options.service.confirmCandidate({ candidateId });
          return { ok: true, refresh: true, ref: request.ref };
        case 'edit-aliases':
          return this.executeAliasAction(entityId, request);
        case 'dismiss-requirement':
          if (!candidateId) {
            return {
              ok: false,
              message: this.translate('No candidate ref is available.'),
              ref: request.ref,
            };
          }
          await this.options.service.dismissCandidate(candidateId);
          return { ok: true, refresh: true, ref: request.ref };
        case 'archive-binding':
          return this.executeArchiveBindingAction(request);
        case 'cleanup-suggested-orphan':
          return this.executeCleanupSuggestedOrphanAction(request);
        case 'rebind-orphaned-binding':
          return this.executeRebindOrphanedBindingAction(request);
        case 'locate-binding-source':
          return {
            ok: false,
            message: this.translate(
              '{0} requires an asset picker or file reveal provider.',
              request.action,
            ),
            ref: request.ref,
          };
        default:
          return {
            ok: false,
            message: this.translate('Unsupported action: {0}', request.action),
            ref: request.ref,
          };
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        ref: request.ref,
      };
    }
  }

  private async executeNpcTestAction(
    entityId: string | undefined,
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    if (!request.ref) {
      return { ok: false, message: this.translate('Missing creative entity ref.') };
    }
    if (request.ref.entityKind !== 'character') {
      return {
        ok: false,
        message: this.translate('Only character entities support Character Dialogue.'),
        ref: request.ref,
      };
    }
    if (!entityId) {
      return {
        ok: false,
        message: this.translate('No usable character entity ref is available.'),
        ref: request.ref,
      };
    }
    if (!this.options.executeCommand) {
      return {
        ok: false,
        message: this.translate('No Agent command executor is available.'),
        ref: request.ref,
      };
    }

    const mode = readNpcMode(request.payload);
    const launchRequest: NpcTestBenchLaunchRequest = {
      entityRef: {
        entityId,
        entityKind: 'character',
        projectRoot: this.options.projectRoot,
        source: this.source,
      },
      dashboardRef: request.ref,
      source: 'dashboard',
      projectRoot: this.options.projectRoot,
      enrichment: 'skip',
      ...(mode ? { mode } : {}),
    };

    await this.options.executeCommand(NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND, launchRequest);
    return { ok: true, refresh: false, ref: request.ref };
  }

  private async executeNpcWorkflowAction(
    action: DashboardCharacterRoleWorkflowAction,
    entityId: string | undefined,
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    if (!request.ref) {
      return { ok: false, message: this.translate('Missing creative entity ref.') };
    }
    if (request.ref.entityKind !== 'character') {
      return {
        ok: false,
        message: this.translate('Only character entities support character workflows.'),
        ref: request.ref,
      };
    }
    if (!entityId) {
      return {
        ok: false,
        message: this.translate('No usable character entity ref is available.'),
        ref: request.ref,
      };
    }
    if (!this.options.executeCommand) {
      return {
        ok: false,
        message: this.translate('No Agent command executor is available.'),
        ref: request.ref,
      };
    }

    const workflowRequest: NpcAgentWorkflowRequest = {
      workflow: action,
      entityRef: {
        entityId,
        entityKind: 'character',
        projectRoot: this.options.projectRoot,
        source: this.source,
      },
      dashboardRef: request.ref,
      scopes: readNpcWorkflowScopes(request.payload),
      prompt: readNpcWorkflowPrompt(request.payload),
      source: 'dashboard',
      projectRoot: this.options.projectRoot,
    };
    const command = commandForNpcWorkflow(action);
    await this.options.executeCommand(command, workflowRequest);
    return {
      ok: true,
      refresh: false,
      ref: request.ref,
      characterRoleWorkflow: { kind: 'delegated-command', command },
    };
  }

  onDidChangeEntity(listener: (event: DashboardCreativeEntityEvent) => void): EntityDisposable {
    return this.options.subscribe?.(listener) ?? { dispose: () => undefined };
  }

  private async executeAliasAction(
    entityId: string | undefined,
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    if (!entityId) {
      return {
        ok: false,
        message: this.translate('No entity ref is available.'),
        ref: request.ref,
      };
    }
    const alias = typeof request.payload?.['alias'] === 'string' ? request.payload['alias'] : '';
    if (!alias.trim()) {
      return { ok: false, message: this.translate('Alias is required.'), ref: request.ref };
    }
    const remove = request.payload?.['remove'] === true;
    if (remove) {
      await this.options.service.removeAlias(entityId, alias);
    } else {
      await this.options.service.addAlias(entityId, alias);
    }
    return { ok: true, refresh: true, ref: request.ref };
  }

  private async executeArchiveBindingAction(
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    const bindingId = readStringPayload(request.payload, 'bindingId');
    if (!bindingId) {
      return {
        ok: false,
        message: this.translate('Binding id is required.'),
        ref: request.ref,
      };
    }
    await this.options.service.archiveBindings({ bindingIds: [bindingId] });
    return { ok: true, refresh: true, ref: request.ref };
  }

  private async executeRebindOrphanedBindingAction(
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    const bindingId = readStringPayload(request.payload, 'bindingId');
    const assetRef = readStringPayload(request.payload, 'assetRef');
    if (!bindingId || !assetRef) {
      return {
        ok: false,
        message: this.translate('Rebind requires bindingId and assetRef payload fields.'),
        ref: request.ref,
      };
    }
    const validation = ASSET_REF_VALIDATOR.validate(assetRef);
    if (!validation.valid) {
      return {
        ok: false,
        message: validation.reason ?? this.translate('Invalid assetRef.'),
        ref: request.ref,
      };
    }
    const binding = (await this.options.service.bindings.list()).find(
      (item) => item.id === bindingId,
    );
    if (!binding) {
      return {
        ok: false,
        message: this.translate('Binding was not found.'),
        ref: request.ref,
      };
    }
    const { orphanedAt: _orphanedAt, ...rest } = binding;
    await this.options.service.upsertBinding({
      ...rest,
      assetRef,
      availability: 'active',
      updatedAt: this.now(),
    });
    return { ok: true, refresh: true, ref: request.ref };
  }

  private async executeCleanupSuggestedOrphanAction(
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    const bindingId = readStringPayload(request.payload, 'bindingId');
    if (!bindingId) {
      return {
        ok: false,
        message: this.translate('Binding id is required.'),
        ref: request.ref,
      };
    }
    if (!this.options.executeCommand) {
      return {
        ok: false,
        message: this.translate('No facade command executor is available.'),
        ref: request.ref,
      };
    }
    await this.options.executeCommand('neko.entity.unbindAsset', {
      projectRoot: this.options.projectRoot,
      bindingId,
    });
    return { ok: true, refresh: true, ref: request.ref };
  }

  private async projectMemoryReviews(
    entity: CreativeEntity,
  ): Promise<readonly DashboardEntityMemoryReviewItem[] | undefined> {
    if (!this.options.characterMemory || entity.kind !== 'character') return undefined;
    const memory = await this.options.characterMemory.store.load(this.options.characterMemory.path);
    if (!memory) return undefined;
    const ref = entityRef(entity);
    const reviews = memory.ledger.observations
      .filter((observation) => shouldShowMemoryReview(observation, entity.id))
      .map((observation) => projectMemoryReviewItem(observation, ref));
    return reviews.length > 0 ? reviews : undefined;
  }

  private async executeMemoryReviewAction(
    action: DashboardEntityMemoryReviewAction,
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    if (!this.options.characterMemory) {
      return {
        ok: false,
        message: this.translate('Character memory review is not available.'),
        ref: request.ref,
      };
    }
    const reviewId = request.memoryReviewId;
    if (!reviewId) {
      return {
        ok: false,
        message: this.translate('No memory review id is available.'),
        ref: request.ref,
      };
    }
    const memory = await this.options.characterMemory.store.load(this.options.characterMemory.path);
    if (!memory) {
      return {
        ok: false,
        message: this.translate('Character memory file is not available.'),
        ref: request.ref,
      };
    }
    if (!memory.ledger.observations.some((observation) => observation.observationId === reviewId)) {
      return {
        ok: false,
        message: this.translate('Character memory review was not found: {0}', reviewId),
        ref: request.ref,
      };
    }

    const updatedAt = this.now();
    const result = updateMemoryReviewStatus(memory, reviewId, action, updatedAt);
    if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return {
        ok: false,
        message: result.diagnostics.map((diagnostic) => diagnostic.message).join('; '),
        ref: request.ref,
      };
    }

    await this.options.characterMemory.store.save(this.options.characterMemory.path, result.memory);
    return {
      ok: true,
      refresh: true,
      ref: request.ref,
      ...(result.diagnostics.length > 0
        ? { message: result.diagnostics.map((diagnostic) => diagnostic.message).join('; ') }
        : {}),
    };
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }
}

function projectEntityRow(
  entity: CreativeEntity,
  bindings: readonly EntityAssetBinding[],
  requirements: readonly EntityAssetRequirement[],
  drafts: readonly VisualIdentityDraft[],
  translate: EntityDashboardTranslate,
): DashboardCreativeEntityRow {
  const entityBindings = bindings.filter(
    (binding) => binding.entityId === entity.id && binding.entityKind === entity.kind,
  );
  const orphanedBindingCount = entityBindings.filter(
    (binding) => binding.availability === 'orphaned',
  ).length;
  const entityRequirements = requirements.filter(
    (requirement) =>
      requirement.entityId === entity.id &&
      requirement.entityKind === entity.kind &&
      requirement.status !== 'bound' &&
      requirement.status !== 'dismissed',
  );
  const entityDrafts =
    entity.kind === 'character'
      ? drafts.filter((draft) => draft.characterId === entity.id && draft.status !== 'discarded')
      : [];
  const label = entity.displayName ?? entity.canonicalName;
  return {
    ref: entityRef(entity),
    label,
    kind: entity.kind,
    status: entity.status,
    sourceKind: 'registry',
    aliases: entity.aliases,
    defaultBindingRoles: entityBindings
      .filter((binding) => binding.isDefault)
      .map((binding) => binding.role),
    ...(orphanedBindingCount > 0 ? { orphanedBindingCount } : {}),
    missingRepresentationKinds: Array.from(
      new Set(entityRequirements.flatMap((requirement) => requirement.requiredKinds)),
    ).sort(),
    visualDraftCount: entityDrafts.length,
    freshness: 'fresh',
    actions: entityActions(entity.kind, 'row', orphanedBindingCount, [], translate),
    searchText: [label, entity.canonicalName, ...entity.aliases, entity.kind, entity.status].join(
      ' ',
    ),
  };
}

function projectCandidateRow(
  candidate: CreativeEntityCandidate,
  translate: EntityDashboardTranslate,
): DashboardCreativeEntityRow {
  const pendingName = candidate.identityBasis !== 'user-named';
  const label = pendingName ? pendingNameLabel(candidate, translate) : candidate.name;
  return {
    ref: candidateRef(candidate),
    label,
    kind: candidate.kind,
    status: 'candidate',
    sourceKind: 'script',
    aliases: candidate.aliases ?? [],
    summary: pendingName
      ? translate('Pending name · {0} candidate', candidate.identityBasis)
      : translate('Creative entity candidate'),
    occurrenceCount: candidate.sourceRefs.length,
    freshness: 'fresh',
    actions: candidateActions(candidate.kind, translate),
    searchText: [
      label,
      candidate.name,
      ...(candidate.aliases ?? []),
      candidate.kind,
      'candidate',
    ].join(' '),
  };
}

function projectEntityDetail(
  entity: CreativeEntity,
  bindings: readonly EntityAssetBinding[],
  requirements: readonly EntityAssetRequirement[],
  drafts: readonly VisualIdentityDraft[],
  memoryReviews?: readonly DashboardEntityMemoryReviewItem[],
  translate: EntityDashboardTranslate = defaultTranslate,
): DashboardCreativeEntityDetail {
  const ref = entityRef(entity);
  const bindingSummaries = bindings
    .filter((binding) => binding.entityId === entity.id && binding.entityKind === entity.kind)
    .map((binding) => ({
      id: binding.id,
      role: binding.role,
      assetRef: binding.assetRef,
      status: binding.status,
      availability: binding.availability,
      orphanedAt: binding.orphanedAt,
      source: binding.source,
      isDefault: binding.isDefault === true,
      confidence: binding.confidence,
      updatedAt: binding.updatedAt,
    }));
  return {
    ref,
    label: entity.displayName ?? entity.canonicalName,
    kind: entity.kind,
    status: entity.status,
    sourceKind: 'registry',
    aliases: entity.aliases,
    metadata: entity.metadata,
    relationships: [],
    occurrences: [],
    bindings: bindingSummaries,
    defaults: bindingSummaries.filter((binding) => binding.isDefault),
    requirements: requirements
      .filter(
        (requirement) =>
          requirement.entityId === entity.id && requirement.entityKind === entity.kind,
      )
      .map((requirement) => ({
        id: requirement.id,
        entityId: requirement.entityId,
        entityKind: requirement.entityKind,
        source: requirement.source,
        sourceRef: requirement.sourceRef,
        requiredKinds: requirement.requiredKinds,
        status: requirement.status,
        actions: ['generate', 'import', 'bind-existing', 'dismiss'],
      })),
    visualDrafts:
      entity.kind === 'character'
        ? drafts
            .filter((draft) => draft.characterId === entity.id)
            .map((draft) => ({
              id: draft.id,
              characterId: draft.characterId,
              source: draft.source,
              prompt: draft.prompt,
              generatedAssetIds: draft.generatedAssetIds,
              selectedAssetId: draft.selectedAssetId,
              status: draft.status,
              factCount: draft.extractedVisualFacts?.length ?? 0,
            }))
        : [],
    syncSuggestions: [],
    ...(memoryReviews ? { memoryReviews } : {}),
    freshness: 'fresh',
    actions: entityActions(
      entity.kind,
      'detail',
      bindingSummaries.filter((binding) => binding.availability === 'orphaned').length,
      bindingSummaries,
      translate,
    ),
  };
}

function projectCandidateDetail(
  candidate: CreativeEntityCandidate,
  translate: EntityDashboardTranslate,
): DashboardCreativeEntityDetail {
  const pendingName = candidate.identityBasis !== 'user-named';
  return {
    ref: candidateRef(candidate),
    label: pendingName ? pendingNameLabel(candidate, translate) : candidate.name,
    kind: candidate.kind,
    status: 'candidate',
    sourceKind: 'script',
    aliases: candidate.aliases ?? [],
    metadata: {
      ...(candidate.metadata ?? {}),
      identityBasis: candidate.identityBasis,
      ...(pendingName ? { namingState: 'pending-name' } : {}),
    },
    relationships: [],
    occurrences: candidate.sourceRefs.map((sourceRef) => ({
      source: 'script',
      role: 'reference',
      label: candidate.name,
      location: sourceRef,
    })),
    bindings: [],
    defaults: [],
    requirements:
      candidate.suggestedRequirements?.map((requirement) => ({
        id: requirement.id,
        entityId: requirement.entityId,
        entityKind: requirement.entityKind,
        source: requirement.source,
        sourceRef: requirement.sourceRef,
        requiredKinds: requirement.requiredKinds,
        status: requirement.status,
        actions: ['generate', 'import', 'bind-existing', 'dismiss'],
      })) ?? [],
    visualDrafts: [],
    syncSuggestions: [],
    freshness: 'fresh',
    actions: candidateActions(candidate.kind, translate),
  };
}

function entityRef(entity: CreativeEntity): DashboardCreativeEntityRef {
  return {
    source: 'neko-entity',
    sourceEntityId: `entity:${entity.id}`,
    entityId: entity.id,
    entityKind: entity.kind,
  };
}

function candidateRef(candidate: CreativeEntityCandidate): DashboardCreativeEntityRef {
  return {
    source: 'neko-entity',
    sourceEntityId: candidate.id,
    entityId: candidate.id,
    entityKind: candidate.kind,
  };
}

function entityActions(
  kind: CreativeEntity['kind'],
  surface: 'row' | 'detail',
  orphanedBindingCount = 0,
  bindings: readonly {
    readonly id: string;
    readonly status: EntityAssetBinding['status'];
    readonly availability: EntityAssetBinding['availability'];
  }[] = [],
  translate: EntityDashboardTranslate = defaultTranslate,
): DashboardCreativeEntityRow['actions'] {
  const actions: DashboardCreativeEntityRow['actions'] = [
    { id: 'show-detail', label: 'Show detail' },
    { id: 'edit-aliases', label: 'Edit aliases' },
    { id: 'bind-existing', label: 'Bind asset' },
    { id: 'refresh', label: 'Refresh' },
  ];
  const orphanActions =
    orphanedBindingCount > 0 ? orphanedBindingActions(surface, bindings, translate) : [];
  const baseActions =
    kind === 'character'
      ? [
          actions[0],
          { id: 'character-dialogue', label: 'Character Dialogue' },
          ...(surface === 'detail' ? characterRoleWorkflowActions() : []),
          ...actions.slice(1),
        ].filter(
          (action): action is DashboardCreativeEntityRow['actions'][number] => action !== undefined,
        )
      : actions;
  return [...baseActions, ...orphanActions];
}

function candidateActions(
  kind: CreativeEntityCandidate['kind'],
  translate: EntityDashboardTranslate = defaultTranslate,
): DashboardCreativeEntityRow['actions'] {
  const characterActions = kind === 'character' ? characterRoleWorkflowActions() : [];
  return [
    { id: 'show-detail', label: 'Show detail' },
    {
      id: 'character-dialogue',
      label: 'Character Dialogue',
      disabled: kind !== 'character',
      ...(kind !== 'character'
        ? { reason: translate('Only character candidates support Character Dialogue.') }
        : {}),
    },
    ...characterActions,
    { id: 'confirm-candidate', label: 'Confirm candidate' },
    { id: 'dismiss-requirement', label: 'Dismiss' },
  ];
}

function orphanedBindingActions(
  surface: 'row' | 'detail',
  bindings: readonly {
    readonly id: string;
    readonly status: EntityAssetBinding['status'];
    readonly availability: EntityAssetBinding['availability'];
  }[],
  translate: EntityDashboardTranslate,
): DashboardCreativeEntityRow['actions'] {
  const orphaned = bindings.filter((binding) => binding.availability === 'orphaned');
  const confirmed = orphaned.find((binding) => binding.status === 'confirmed');
  const suggested = orphaned.find((binding) => binding.status === 'suggested');
  return [
    { id: 'rebind-orphaned-binding', label: 'Rebind orphaned asset' },
    { id: 'locate-binding-source', label: 'Locate source' },
    {
      id: 'archive-binding',
      label: surface === 'detail' ? 'Archive orphaned binding' : 'Archive orphan',
      ...(confirmed ? { reason: translate('Confirmed orphan: {0}', confirmed.id) } : {}),
    },
    ...(suggested
      ? [
          {
            id: 'cleanup-suggested-orphan' as const,
            label: 'Cleanup suggested orphan',
            reason: translate('Suggested orphan: {0}', suggested.id),
          },
        ]
      : []),
  ];
}

function pendingNameLabel(
  candidate: CreativeEntityCandidate,
  translate: EntityDashboardTranslate,
): string {
  return candidate.name.trim()
    ? translate('{0} (pending name)', candidate.name)
    : translate('Unnamed candidate');
}

function characterRoleWorkflowActions(
  disabledReason?: string,
): DashboardCreativeEntityRow['actions'] {
  const disabled = disabledReason !== undefined;
  return [
    {
      id: 'embody-character',
      label: 'Embody Character',
      ...(disabled ? { disabled, reason: disabledReason } : {}),
    },
  ];
}

function shouldShowMemoryReview(
  observation: CharacterObservation,
  entityId: string,
): observation is ReviewableCharacterObservation {
  return (
    observation.entityRef?.entityId === entityId &&
    observation.reviewStatus !== 'accepted' &&
    observation.reviewStatus !== 'superseded' &&
    observation.reviewStatus !== 'rejected'
  );
}

function projectMemoryReviewItem(
  observation: ReviewableCharacterObservation,
  entityRef: DashboardCreativeEntityRef,
): DashboardEntityMemoryReviewItem {
  return {
    reviewId: observation.observationId,
    observationId: observation.observationId,
    entityRef,
    sourcePackage: observation.provenance.providerId ?? observation.provenance.source,
    ...(observation.provenance.providerId
      ? { sourceLabel: observation.provenance.providerId }
      : {}),
    sourceKind: observation.provenance.source,
    reviewPolicy: observation.reviewStatus === 'draft' ? 'draft-only' : 'requires-user-review',
    reviewStatus: observation.reviewStatus,
    dimensions: observation.dimensions.map((dimension) => dimension.dimension),
    summary: summarizeObservation(observation),
    ...(observation.notes ? { evidenceText: observation.notes } : {}),
    ...(observation.confidence !== undefined ? { confidence: observation.confidence } : {}),
    ...(observation.createdAt ? { createdAt: observation.createdAt } : {}),
    actions: memoryReviewActions(observation.reviewStatus),
  };
}

function summarizeObservation(observation: CharacterObservation): string {
  const notes = observation.dimensions
    .map((dimension) =>
      dimension.note && dimension.note.trim().length > 0
        ? dimension.note.trim()
        : `${dimension.dimension}: ${formatMemoryValue(dimension.value)}`,
    )
    .filter((value) => value.length > 0);
  return notes[0] ?? observation.notes ?? observation.observationId;
}

function formatMemoryValue(value: CharacterObservation['dimensions'][number]['value']): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(value);
}

function memoryReviewActions(
  status: CharacterMemoryReviewStatus,
): readonly DashboardEntityMemoryReviewAction[] {
  if (status === 'accepted' || status === 'rejected' || status === 'superseded') return [];
  return [
    'accept-memory-review',
    'reject-memory-review',
    'mark-memory-conflict',
    'supersede-memory-review',
  ];
}

function updateMemoryReviewStatus(
  memory: CharacterMemoryFile,
  observationId: string,
  action: DashboardEntityMemoryReviewAction,
  updatedAt: string,
): ReturnType<typeof updateCharacterObservationReviewStatus> {
  switch (action) {
    case 'accept-memory-review':
      return updateCharacterObservationReviewStatus(memory, observationId, 'accepted', {
        reviewer: 'dashboard',
        updatedAt,
      });
    case 'reject-memory-review':
      return updateCharacterObservationReviewStatus(memory, observationId, 'rejected', {
        reviewer: 'dashboard',
        updatedAt,
      });
    case 'supersede-memory-review':
      return updateCharacterObservationReviewStatus(memory, observationId, 'superseded', {
        reviewer: 'dashboard',
        updatedAt,
      });
    case 'mark-memory-conflict':
      return updateCharacterObservationReviewStatus(memory, observationId, 'conflict', {
        reviewer: 'dashboard',
        updatedAt,
        notes: 'Marked as conflict from Dashboard review.',
      });
  }
}

function readNpcMode(payload: DashboardCreativeEntityActionRequest['payload']) {
  const mode = payload?.['mode'];
  return isNpcTestMode(mode) ? mode : undefined;
}

function readStringPayload(
  payload: DashboardCreativeEntityActionRequest['payload'],
  key: string,
): string | undefined {
  const value = payload?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNpcWorkflowScopes(payload: DashboardCreativeEntityActionRequest['payload']) {
  const scopes = payload?.['scopes'];
  return Array.isArray(scopes)
    ? scopes.filter(isDashboardCharacterRoleWorkflowScopeRef)
    : undefined;
}

function readNpcWorkflowPrompt(payload: DashboardCreativeEntityActionRequest['payload']) {
  const prompt = payload?.['prompt'];
  return typeof prompt === 'string' ? prompt : undefined;
}

function commandForNpcWorkflow(action: DashboardCharacterRoleWorkflowAction): string {
  switch (action) {
    case 'embody-character':
      return NEKO_AGENT_EMBODY_CHARACTER_COMMAND;
  }
}

function compareRows(a: DashboardCreativeEntityRow, b: DashboardCreativeEntityRow): number {
  return (
    statusRank(a.status) - statusRank(b.status) ||
    a.kind.localeCompare(b.kind) ||
    a.label.localeCompare(b.label)
  );
}

function statusRank(status: DashboardCreativeEntityRow['status']): number {
  switch (status) {
    case 'candidate':
      return 0;
    case 'confirmed':
      return 1;
    case 'deprecated':
      return 2;
    case 'merged':
      return 3;
    case 'unknown':
      return 4;
  }
}
