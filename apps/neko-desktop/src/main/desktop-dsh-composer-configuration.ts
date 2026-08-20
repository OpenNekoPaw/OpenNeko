import {
  DSH_ACP_MODEL_CONFIG_ID,
  encodeDshAcpModelConfiguration,
  type DshAcpPermissionPresetProjection,
} from '@neko/agent-contracts/dsh-acp';
import type {
  DshComposerContextProjection,
  DshComposerConfigurationProjection,
  DshComposerMentionProjection,
  DshComposerModelOption,
} from '@neko/agent-contracts/dsh-session-host';
import {
  createResourceBrowserSearchRequest,
  type ResourceBrowserIdentity,
  type ResourceBrowserProjection,
} from '@neko/assets-domain/resource-browser/contract';
import type { AgentConversationContext } from '@neko/agent-contracts';
import type { WorkspaceAssetMaterializationResult } from '@neko/assets-domain/global-library';
import type { ProjectEntityRecord } from '@neko/entity-domain';
import type {
  AgentConversationContextAuthorityPort,
  ConversationDshSessionBoundClient,
} from '@neko/agent-runtime/application';
import type { ConfigManager } from '@neko/host/settings';
import type { DesktopDshExecutionCatalog } from './desktop-dsh-provider-runtime';

interface ComposerSurfaceScope {
  readonly windowId: string;
  readonly binding: AgentConversationContext;
  readonly conversationId?: string;
  readonly mentionIdentity?: ResourceBrowserIdentity;
}

interface ComposerSurfaceIdentity {
  readonly windowId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
}

type ComposerConfigManager = Pick<
  ConfigManager,
  'getAssistantConfigState' | 'setAssistantSettings' | 'setDefaultModelPurposeRefs'
>;

export function createDesktopDshComposerConfiguration(options: {
  resolveSurface(input: ComposerSurfaceIdentity): Promise<ComposerSurfaceScope>;
  readonly contexts: Pick<AgentConversationContextAuthorityPort, 'readContext'>;
  readonly workspaceGrants: {
    restore(
      windowId: string,
      workspaceGrantId: string,
      workspaceId: string,
    ): Promise<{
      readonly workspace: {
        readonly workspaceId: string;
        readonly workspacePath: string;
        readonly displayName: string;
      };
    }>;
  };
  readonly configuration: {
    getApplicationConfig(): ComposerConfigManager;
    getWorkspaceConfig(input: {
      readonly workspaceId: string;
      readonly workspacePath: string;
    }): ComposerConfigManager;
  };
  readonly sessions: Pick<
    ConversationDshSessionBoundClient,
    'setSessionConfigOption' | 'readInputCatalog'
  >;
  readonly executionCatalog: DesktopDshExecutionCatalog;
  readonly resourceBrowser: {
    query(windowId: string, request: unknown): Promise<ResourceBrowserProjection>;
  };
  readonly assets: {
    materialize(input: {
      readonly assetId: string;
      readonly workspaceRoot: string;
    }): Promise<WorkspaceAssetMaterializationResult>;
  };
  readonly entities: {
    search(input: {
      readonly workspace: { readonly workspaceId: string; readonly workspacePath: string };
      readonly query: string;
      readonly limit: number;
    }): Promise<readonly ProjectEntityRecord[]>;
  };
  readonly permissions: {
    read(conversationId?: string): Promise<DshAcpPermissionPresetProjection>;
    set(
      conversationId: string,
      permissionPresetId: string,
    ): Promise<DshAcpPermissionPresetProjection>;
  };
}) {
  let mentionRequestSequence = 0;
  const resolveConfiguration = async (
    binding: AgentConversationContext,
    windowId: string,
  ): Promise<{
    readonly config: ComposerConfigManager;
    readonly context?: DshComposerContextProjection;
  }> => {
    if (binding.kind !== 'workspace' && binding.kind !== 'authoring') {
      return { config: options.configuration.getApplicationConfig() };
    }
    const resolution = await options.workspaceGrants.restore(
      windowId,
      binding.workspaceGrantId,
      binding.workspaceId,
    );
    return {
      config: options.configuration.getWorkspaceConfig({
        workspaceId: resolution.workspace.workspaceId,
        workspacePath: resolution.workspace.workspacePath,
      }),
      context: {
        kind: 'workspace',
        workspaceId: resolution.workspace.workspaceId,
        workspaceLabel: resolution.workspace.displayName,
        canvas: { kind: 'workspace-board', label: 'Workspace Board' },
      },
    };
  };

  const apply = async (
    conversationId: string,
    config: ComposerConfigManager,
  ): Promise<{ readonly supportsImageInput: boolean }> => {
    const effective = requireEffectiveConfiguration(config, options.executionCatalog);
    await options.sessions.setSessionConfigOption(
      conversationId,
      DSH_ACP_MODEL_CONFIG_ID,
      encodeDshAcpModelConfiguration(effective.model),
    );
    return { supportsImageInput: effective.supportsImageInput };
  };

  const readInputCatalog = (conversationId: string | undefined) =>
    conversationId === undefined ? undefined : options.sessions.readInputCatalog(conversationId);

  return Object.freeze({
    async project(input: ComposerSurfaceIdentity): Promise<DshComposerConfigurationProjection> {
      const scope = await options.resolveSurface(input);
      const resolved = await resolveConfiguration(scope.binding, scope.windowId);
      return projectConfiguration(
        resolved.config,
        options.executionCatalog,
        await options.permissions.read(scope.conversationId),
        resolved.context,
        await readInputCatalog(scope.conversationId),
      );
    },

    async searchMentions(
      input: ComposerSurfaceIdentity & { readonly filter: string },
    ): Promise<readonly DshComposerMentionProjection[]> {
      const scope = await options.resolveSurface(input);
      if (
        (scope.binding.kind !== 'workspace' && scope.binding.kind !== 'authoring') ||
        scope.mentionIdentity === undefined
      ) {
        throw new Error('Composer mentions require an exact Workspace-bound Agent Surface.');
      }
      const mentionIdentity = scope.mentionIdentity;
      const query = input.filter.trim();
      const workspace = await options.workspaceGrants.restore(
        scope.windowId,
        scope.binding.workspaceGrantId,
        scope.binding.workspaceId,
      );
      const requests = (['files', 'media', 'assets'] as const).map((source) =>
        createResourceBrowserSearchRequest({
          requestId: `dsh-composer-mentions:${++mentionRequestSequence}:${source}`,
          identity: mentionIdentity,
          source,
          query,
          limit: 50,
        }),
      );
      const [projections, entities] = await Promise.all([
        Promise.all(
          requests.map((request) => options.resourceBrowser.query(scope.windowId, request)),
        ),
        options.entities.search({ workspace: workspace.workspace, query, limit: 50 }),
      ]);
      const resources = projections
        .flatMap((projection) => projection.items)
        .flatMap((item): DshComposerMentionProjection[] => {
          if (item.role === 'asset') {
            if (item.availability !== 'available') return [];
            return [
              {
                id: `${item.source}:${item.resourceId}`,
                kind: 'asset',
                label: item.label,
                ...(item.description === undefined ? {} : { description: item.description }),
                assetId: item.assetRef.assetId,
                source: 'asset-library',
              },
            ];
          }
          if (item.role !== 'content' || item.kind === 'directory') return [];
          const mediaType = projectMentionMediaType(item.kind);
          return [
            {
              id: `${item.source}:${item.resourceId}`,
              kind: item.source === 'media' ? 'media' : 'file',
              label: item.label,
              ...(item.description === undefined ? {} : { description: item.description }),
              contentLocator: item.locator,
              source: item.source === 'media' ? 'media-library' : 'workspace',
              ...(mediaType === undefined ? {} : { mediaType }),
            },
          ];
        });
      return [...resources, ...entities.map(projectEntityMention)];
    },

    async materializeAsset(input: ComposerSurfaceIdentity & { readonly assetId: string }) {
      const scope = await options.resolveSurface(input);
      if (scope.binding.kind !== 'workspace' && scope.binding.kind !== 'authoring') {
        throw new Error('Composer Asset materialization requires a Workspace-bound Agent Surface.');
      }
      const workspace = await options.workspaceGrants.restore(
        scope.windowId,
        scope.binding.workspaceGrantId,
        scope.binding.workspaceId,
      );
      const result = await options.assets.materialize({
        assetId: input.assetId,
        workspaceRoot: workspace.workspace.workspacePath,
      });
      if (result.status === 'unavailable') {
        throw new Error(`${result.diagnostic.code}: ${result.diagnostic.message}`);
      }
      return {
        assetId: result.assetId,
        label: result.label,
        contentLocator: result.contentLocator,
        source: 'asset-library' as const,
      };
    },

    async selectModel(
      input: ComposerSurfaceIdentity & { readonly modelOptionId: string },
    ): Promise<DshComposerConfigurationProjection> {
      const scope = await options.resolveSurface(input);
      const resolved = await resolveConfiguration(scope.binding, scope.windowId);
      const config = resolved.config;
      const state = config.getAssistantConfigState();
      const matches = state.chatModelOptions.filter((model) => model.id === input.modelOptionId);
      if (matches.length !== 1) {
        throw new Error(
          `Composer model '${input.modelOptionId}' must resolve to exactly one configured model.`,
        );
      }
      const selected = matches[0];
      if (!selected) throw new Error(`Composer model '${input.modelOptionId}' is unavailable.`);
      if (options.executionCatalog.resolve(selected.providerId, selected.modelId) === undefined) {
        throw new Error(
          `Composer model '${selected.providerId}/${selected.modelId}' is not executable by the current DSH runtime.`,
        );
      }
      await config.setAssistantSettings({
        selectedProviderId: selected.providerId,
        selectedModelId: selected.modelId,
      });
      if (scope.conversationId !== undefined) await apply(scope.conversationId, config);
      return projectConfiguration(
        config,
        options.executionCatalog,
        await options.permissions.read(scope.conversationId),
        resolved.context,
        await readInputCatalog(scope.conversationId),
      );
    },

    async selectPermissionPreset(
      input: ComposerSurfaceIdentity & { readonly permissionPresetId: string },
    ): Promise<DshComposerConfigurationProjection> {
      const scope = await options.resolveSurface(input);
      const resolved = await resolveConfiguration(scope.binding, scope.windowId);
      const current = await options.permissions.read(scope.conversationId);
      if (!current.options.some((option) => option.value === input.permissionPresetId)) {
        throw new Error(
          `DSH permission preset '${input.permissionPresetId}' is not advertised by the runtime.`,
        );
      }
      const projection =
        scope.conversationId === undefined
          ? { ...current, currentValue: input.permissionPresetId }
          : await options.permissions.set(scope.conversationId, input.permissionPresetId);
      return projectConfiguration(
        resolved.config,
        options.executionCatalog,
        projection,
        resolved.context,
        await readInputCatalog(scope.conversationId),
      );
    },

    async selectMediaModel(
      input: ComposerSurfaceIdentity & {
        readonly category: 'image' | 'video' | 'audio';
        readonly modelOptionId: string;
      },
    ): Promise<DshComposerConfigurationProjection> {
      const scope = await options.resolveSurface(input);
      const resolved = await resolveConfiguration(scope.binding, scope.windowId);
      const config = resolved.config;
      const state = config.getAssistantConfigState();
      const matches = state.chatModelOptions.filter(
        (model) => model.id === input.modelOptionId && model.category === input.category,
      );
      if (matches.length !== 1) {
        throw new Error(
          `Composer ${input.category} model '${input.modelOptionId}' must resolve to exactly one configured model.`,
        );
      }
      const selected = matches[0];
      if (!selected)
        throw new Error(`Composer media model '${input.modelOptionId}' is unavailable.`);
      await config.setDefaultModelPurposeRefs({
        [mediaPurpose(input.category)]: {
          providerId: selected.providerId,
          modelId: selected.modelId,
        },
      });
      return projectConfiguration(
        config,
        options.executionCatalog,
        await options.permissions.read(scope.conversationId),
        resolved.context,
        await readInputCatalog(scope.conversationId),
      );
    },

    async applyConversation(
      conversationId: string,
      windowId: string,
    ): Promise<{ readonly supportsImageInput: boolean }> {
      const binding = await options.contexts.readContext(conversationId);
      if (binding === undefined) {
        throw new Error(`Conversation '${conversationId}' has no authoritative domain context.`);
      }
      const resolved = await resolveConfiguration(binding, windowId);
      return apply(conversationId, resolved.config);
    },
  });
}

function projectEntityMention(entity: ProjectEntityRecord): DshComposerMentionProjection {
  const label = entity.names.display ?? entity.names.canonical;
  const kind = entity.kind === 'character' || entity.kind === 'scene' ? entity.kind : 'entity';
  return {
    id: `entity:${entity.entityId}`,
    kind,
    label,
    description: entity.kind,
    contextPayload: {
      type: kind,
      id: entity.entityId,
      label,
      summary: `${entity.kind}: ${label}`,
      data: {
        kind: 'resolved-entity-context',
        entityRef: { entityId: entity.entityId, entityKind: entity.kind },
        entity,
      },
    },
    source: 'entity-graph',
  };
}

function projectMentionMediaType(
  kind: 'file' | 'image' | 'video' | 'audio' | 'document' | 'asset',
): DshComposerMentionProjection['mediaType'] | undefined {
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'document') return kind;
  return kind === 'file' ? 'text' : undefined;
}

function mediaPurpose(
  category: 'image' | 'video' | 'audio',
): 'image.generate' | 'video.generate' | 'audio.generate' {
  if (category === 'image') return 'image.generate';
  if (category === 'video') return 'video.generate';
  return 'audio.generate';
}

function projectConfiguration(
  config: ComposerConfigManager,
  executionCatalog: DesktopDshExecutionCatalog,
  permissionPresets: DshAcpPermissionPresetProjection,
  context?: DshComposerContextProjection,
  inputCatalog?: import('@neko/agent-contracts/dsh-acp').DshAcpInputCatalogProjection,
): DshComposerConfigurationProjection {
  const state = config.getAssistantConfigState();
  const models = state.chatModelOptions
    .filter(
      (model) =>
        (model.category !== undefined && model.category !== 'llm') ||
        executionCatalog.resolve(model.providerId, model.modelId) !== undefined,
    )
    .map(projectModel);
  const modelIds = new Set<string>();
  for (const model of models) {
    if (modelIds.has(model.id)) throw new Error(`Composer model '${model.id}' is duplicated.`);
    modelIds.add(model.id);
  }
  const selected = models.find(
    (model) =>
      model.providerId === state.selectedProviderId && model.modelId === state.selectedModelId,
  );
  const diagnostic =
    state.configDiagnostic?.message ??
    (selected === undefined ? 'The selected chat model is not executable by DSH.' : undefined);
  return {
    models,
    ...(selected === undefined ? {} : { selectedModelOptionId: selected.id }),
    selectedMediaModelOptionIds: { ...state.defaultMediaModels },
    permissionPresetId: permissionPresets.currentValue,
    permissionPresets: permissionPresets.options.map((option) => ({
      id: option.value,
      label: option.name,
      selectable: option.value !== 'custom',
      ...(option.description === undefined ? {} : { description: option.description }),
    })),
    ...(context === undefined ? {} : { context }),
    ...(inputCatalog === undefined ? {} : { inputCatalog }),
    ...(inputCatalog?.skillsComplete === false
      ? { inputCatalogDiagnostic: 'The DSH Skill catalog is incomplete.' }
      : {}),
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
}

function requireEffectiveConfiguration(
  config: ComposerConfigManager,
  executionCatalog: DesktopDshExecutionCatalog,
): {
  readonly model: {
    readonly providerId: string;
    readonly modelId: string;
    readonly maxTokens: number;
  };
  readonly supportsImageInput: boolean;
} {
  const state = config.getAssistantConfigState();
  const selected = state.chatModelOptions.filter(
    (model) =>
      model.providerId === state.selectedProviderId && model.modelId === state.selectedModelId,
  );
  if (selected.length !== 1) {
    throw new Error('Composer requires exactly one configured chat model before prompting DSH.');
  }
  const model = selected[0];
  if (!model) throw new Error('Composer selected model is unavailable.');
  const execution = executionCatalog.resolve(model.providerId, model.modelId);
  if (execution === undefined) {
    throw new Error(
      `Composer model '${model.providerId}/${model.modelId}' is not executable by the current DSH runtime.`,
    );
  }
  return {
    model: {
      providerId: execution.providerId,
      modelId: execution.apiModelName,
      maxTokens: state.maxTokens,
    },
    supportsImageInput: execution.input.includes('image'),
  };
}

function projectModel(model: {
  readonly id: string;
  readonly label: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly providerLabel?: string;
  readonly category?: 'llm' | 'image' | 'video' | 'audio';
  readonly capabilities?: readonly string[];
}): DshComposerModelOption {
  return {
    id: model.id,
    label: model.label,
    providerId: model.providerId,
    modelId: model.modelId,
    providerLabel: model.providerLabel ?? model.providerId,
    category: model.category ?? 'llm',
    capabilities: [...(model.capabilities ?? [])],
  };
}
