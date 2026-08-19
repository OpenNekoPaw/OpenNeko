import {
  DSH_ACP_MODEL_CONFIG_ID,
  encodeDshAcpModelConfiguration,
  type DshAcpPermissionPresetProjection,
} from '@neko/agent-contracts/dsh-acp';
import type {
  DshComposerContextProjection,
  DshComposerConfigurationProjection,
  DshComposerModelOption,
} from '@neko/agent-contracts/dsh-session-host';
import type { AgentBoundDomainBinding } from '@neko/agent-contracts';
import type {
  AgentConversationContextAuthorityPort,
  ConversationDshSessionBoundClient,
} from '@neko/agent-runtime/application';
import type { ConfigManager } from '@neko/host/settings';

interface ComposerSurfaceScope {
  readonly binding: AgentBoundDomainBinding;
  readonly conversationId?: string;
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
    resolveAuthorizedWorkspace(
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
  readonly sessions: Pick<ConversationDshSessionBoundClient, 'setSessionConfigOption'>;
  readonly permissions: {
    read(conversationId?: string): Promise<DshAcpPermissionPresetProjection>;
    set(conversationId: string, permissionPresetId: string): Promise<DshAcpPermissionPresetProjection>;
  };
}) {
  const resolveConfiguration = async (
    binding: AgentBoundDomainBinding,
  ): Promise<{
    readonly config: ComposerConfigManager;
    readonly context?: DshComposerContextProjection;
  }> => {
    if (binding.kind !== 'workspace') {
      return { config: options.configuration.getApplicationConfig() };
    }
    const resolution = await options.workspaceGrants.resolveAuthorizedWorkspace(
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

  const apply = async (conversationId: string, config: ComposerConfigManager): Promise<void> => {
    const effective = requireEffectiveConfiguration(config);
    await options.sessions.setSessionConfigOption(
      conversationId,
      DSH_ACP_MODEL_CONFIG_ID,
      encodeDshAcpModelConfiguration(effective.model),
    );
  };

  return Object.freeze({
    async project(input: ComposerSurfaceIdentity): Promise<DshComposerConfigurationProjection> {
      const scope = await options.resolveSurface(input);
      const resolved = await resolveConfiguration(scope.binding);
      return projectConfiguration(
        resolved.config,
        await options.permissions.read(scope.conversationId),
        resolved.context,
      );
    },

    async selectModel(
      input: ComposerSurfaceIdentity & { readonly modelOptionId: string },
    ): Promise<DshComposerConfigurationProjection> {
      const scope = await options.resolveSurface(input);
      const resolved = await resolveConfiguration(scope.binding);
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
      await config.setAssistantSettings({
        selectedProviderId: selected.providerId,
        selectedModelId: selected.modelId,
      });
      if (scope.conversationId !== undefined) await apply(scope.conversationId, config);
      return projectConfiguration(
        config,
        await options.permissions.read(scope.conversationId),
        resolved.context,
      );
    },

    async selectPermissionPreset(
      input: ComposerSurfaceIdentity & { readonly permissionPresetId: string },
    ): Promise<DshComposerConfigurationProjection> {
      const scope = await options.resolveSurface(input);
      const resolved = await resolveConfiguration(scope.binding);
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
      return projectConfiguration(resolved.config, projection, resolved.context);
    },

    async selectMediaModel(
      input: ComposerSurfaceIdentity & {
        readonly category: 'image' | 'video' | 'audio';
        readonly modelOptionId: string;
      },
    ): Promise<DshComposerConfigurationProjection> {
      const scope = await options.resolveSurface(input);
      const resolved = await resolveConfiguration(scope.binding);
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
      if (!selected) throw new Error(`Composer media model '${input.modelOptionId}' is unavailable.`);
      await config.setDefaultModelPurposeRefs({
        [mediaPurpose(input.category)]: {
          providerId: selected.providerId,
          modelId: selected.modelId,
        },
      });
      return projectConfiguration(
        config,
        await options.permissions.read(scope.conversationId),
        resolved.context,
      );
    },

    async applyConversation(conversationId: string): Promise<void> {
      const binding = await options.contexts.readContext(conversationId);
      if (binding === undefined) {
        throw new Error(`Conversation '${conversationId}' has no authoritative domain context.`);
      }
      const resolved = await resolveConfiguration(binding);
      await apply(conversationId, resolved.config);
    },
  });
}

function mediaPurpose(category: 'image' | 'video' | 'audio'):
  | 'image.generate'
  | 'video.generate'
  | 'audio.generate' {
  if (category === 'image') return 'image.generate';
  if (category === 'video') return 'video.generate';
  return 'audio.generate';
}

function projectConfiguration(
  config: ComposerConfigManager,
  permissionPresets: DshAcpPermissionPresetProjection,
  context?: DshComposerContextProjection,
): DshComposerConfigurationProjection {
  const state = config.getAssistantConfigState();
  const models = state.chatModelOptions.map(projectModel);
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
    (selected === undefined ? 'No configured chat model is selected.' : undefined);
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
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
}

function requireEffectiveConfiguration(config: ComposerConfigManager): {
  readonly model: {
    readonly providerId: string;
    readonly modelId: string;
    readonly maxTokens: number;
  };
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
  return {
    model: {
      providerId: model.providerId,
      modelId: model.modelId,
      maxTokens: state.maxTokens,
    },
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
