import {
  DSH_ACP_MODEL_CONFIG_ID,
  encodeDshAcpModelConfiguration,
} from '@neko/agent-contracts/dsh-acp';
import type {
  DshComposerContextProjection,
  DshComposerConfigurationProjection,
  DshComposerModelOption,
} from '@neko/agent-contracts/dsh-session-host';
import type { AgentBoundDomainBinding, ShellExecutionMode } from '@neko/agent-contracts';
import type {
  AgentConversationContextAuthorityPort,
  ConversationDshSessionBoundClient,
} from '@neko/agent-runtime/application';
import type { ConfigManager } from '@neko/host/settings';

const PLAN_UNAVAILABLE = 'Plan mode is not implemented by the current DSH runtime.';

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
  'getAssistantConfigState' | 'setAssistantSettings'
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
  readonly sessions: Pick<
    ConversationDshSessionBoundClient,
    'setSessionConfigOption' | 'setSessionMode'
  >;
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
    await options.sessions.setSessionMode(conversationId, effective.mode);
  };

  return Object.freeze({
    async project(input: ComposerSurfaceIdentity): Promise<DshComposerConfigurationProjection> {
      const scope = await options.resolveSurface(input);
      const resolved = await resolveConfiguration(scope.binding);
      return projectConfiguration(resolved.config, resolved.context);
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
      return projectConfiguration(config, resolved.context);
    },

    async selectMode(
      input: ComposerSurfaceIdentity & { readonly mode: ShellExecutionMode },
    ): Promise<DshComposerConfigurationProjection> {
      if (input.mode === 'plan') throw new Error(PLAN_UNAVAILABLE);
      const scope = await options.resolveSurface(input);
      const resolved = await resolveConfiguration(scope.binding);
      const config = resolved.config;
      await config.setAssistantSettings({ executionMode: input.mode });
      if (scope.conversationId !== undefined) await apply(scope.conversationId, config);
      return projectConfiguration(config, resolved.context);
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

function projectConfiguration(
  config: ComposerConfigManager,
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
    executionMode: state.executionMode,
    modes: [
      { id: 'plan', available: false, diagnostic: PLAN_UNAVAILABLE },
      { id: 'ask', available: true },
      { id: 'auto', available: true },
    ],
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
  readonly mode: 'ask' | 'auto';
} {
  const state = config.getAssistantConfigState();
  const selected = state.chatModelOptions.filter(
    (model) =>
      model.providerId === state.selectedProviderId && model.modelId === state.selectedModelId,
  );
  if (selected.length !== 1) {
    throw new Error('Composer requires exactly one configured chat model before prompting DSH.');
  }
  if (state.executionMode === 'plan') throw new Error(PLAN_UNAVAILABLE);
  const model = selected[0];
  if (!model) throw new Error('Composer selected model is unavailable.');
  return {
    model: {
      providerId: model.providerId,
      modelId: model.modelId,
      maxTokens: state.maxTokens,
    },
    mode: state.executionMode,
  };
}

function projectModel(model: {
  readonly id: string;
  readonly label: string;
  readonly providerId: string;
  readonly modelId: string;
}): DshComposerModelOption {
  return {
    id: model.id,
    label: model.label,
    providerId: model.providerId,
    modelId: model.modelId,
  };
}
