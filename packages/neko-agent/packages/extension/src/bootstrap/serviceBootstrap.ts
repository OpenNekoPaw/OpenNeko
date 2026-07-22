/**
 * Service Bootstrap for NekoAgent
 *
 * Initializes core services for the AI Agent extension.
 * Simplified version focused on agent-specific services.
 */

import * as vscode from 'vscode';
import * as nodeOs from 'node:os';
import { join } from 'node:path';
import { Platform, createPlatform, FileUserConfigManager } from '@neko/platform';
import {
  MCPManager,
  MemoryTaskRecoveryStorage,
  MemoryTaskStorage,
  TaskManager,
  ToolRegistry,
  DEFAULT_TASK_CLEANUP_INTERVAL_MS,
  DEFAULT_TASK_RETENTION_PERIOD_MS,
  connectMCPServersRuntime,
  type IRuntimeTaskManager,
} from '@neko/agent';
import type {
  AuthInteraction,
  OpenNekoCredentialStore,
  PiProviderAuthController,
} from '@neko/agent/pi';
import type {
  ICapabilityPurposeTextRuntime,
  ITaskRecoveryStorage,
  ITaskStorage,
} from '@neko/shared';
import { ServiceCollection, createServiceId, getLogger } from '../base';

const logger = getLogger('ServiceBootstrap');
import { IEditorRegistry, EditorRegistry } from '../editor/common/editorRegistry';
import { AgentManager, IAgentManager as IAgentManagerInterface } from '../ai/agentManager';
import { TaskLifecycleCoordinator } from '../services/taskLifecycleCoordinator';
import {
  createVSCodePiCredentialRuntime,
  defaultOpenNekoUserDataRoot,
} from '../ai/piCredentialRuntime';
import { VSCodePiRuntimeManager } from '../ai/vscodePiRuntimeManager';
import { VSCodePiPurposeModelRuntime } from '../ai/vscodePiPurposeModelRuntime';
import { getCapabilityRuntimeBindings } from './capabilityBootstrap';
import { createLocalPerceptionAssetLoader } from '../services/perceptionAssetLoader';

// =============================================================================
// Service Identifiers
// =============================================================================

export const IPlatform = createServiceId<Platform>('platform');
const IToolRegistry = createServiceId<ToolRegistry>('toolRegistry');
const IMCPManager = createServiceId<MCPManager>('mcpManager');
export const ITaskManager = createServiceId<IRuntimeTaskManager>('taskManager');
export const IAgentManager = createServiceId<IAgentManagerInterface>('agentManager');
const IPiCredentialStore = createServiceId<OpenNekoCredentialStore>('piCredentialStore');
const IPiProviderAuthController = createServiceId<PiProviderAuthController>(
  'piProviderAuthController',
);
const IPiAuthInteraction = createServiceId<AuthInteraction>('piAuthInteraction');
export const IPiAgentRuntimeManager =
  createServiceId<VSCodePiRuntimeManager>('piAgentRuntimeManager');
export const IProductPurposeTextRuntime = createServiceId<ICapabilityPurposeTextRuntime>(
  'productPurposeTextRuntime',
);
const ITaskLifecycleCoordinator = createServiceId<TaskLifecycleCoordinator>(
  'taskLifecycleCoordinator',
);

// Re-export IEditorRegistry
// =============================================================================
// Service Bootstrap Result
// =============================================================================

export interface IServiceBootstrapResult {
  platform: Platform;
  toolRegistry: ToolRegistry;
  mcpManager: MCPManager;
  taskManager: IRuntimeTaskManager;
  agentManager: AgentManager;
  piCredentialStore: OpenNekoCredentialStore;
  piProviderAuthController: PiProviderAuthController;
  piAuthInteraction: AuthInteraction;
  piAgentRuntimeManager: VSCodePiRuntimeManager;
  productPurposeTextRuntime: ICapabilityPurposeTextRuntime;
  taskLifecycleCoordinator: TaskLifecycleCoordinator;
  editorRegistry: EditorRegistry;
}

export interface ExtensionAgentTaskPersistence {
  readonly taskStorage: ITaskStorage;
  readonly taskRecoveryStorage: ITaskRecoveryStorage;
  readonly workspaceId?: string;
}

// =============================================================================
// Service Bootstrap
// =============================================================================

/**
 * Initialize core services for NekoAgent
 */
export async function bootstrapCoreServices(
  services: ServiceCollection,
  context: vscode.ExtensionContext,
  taskPersistence?: ExtensionAgentTaskPersistence,
): Promise<IServiceBootstrapResult> {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspacePath && !taskPersistence) {
    throw new Error('Workspace Agent bootstrap requires shared SQLite Task persistence.');
  }

  const piCredentials = createVSCodePiCredentialRuntime(
    defaultOpenNekoUserDataRoot(nodeOs.homedir()),
  );
  services.set(IPiCredentialStore, piCredentials.credentials);
  services.set(IPiProviderAuthController, piCredentials.auth);
  services.set(IPiAuthInteraction, piCredentials.interaction);

  // ==========================================================================
  // 1. Task Manager with Persistence
  // ==========================================================================
  const taskStorage = taskPersistence?.taskStorage ?? new MemoryTaskStorage();
  const recoveryStorage = taskPersistence?.taskRecoveryStorage ?? new MemoryTaskRecoveryStorage();
  const taskManager = new TaskManager({
    storage: taskStorage,
    recoveryStorage,
    cleanupIntervalMs: DEFAULT_TASK_CLEANUP_INTERVAL_MS,
    retentionPeriodMs: DEFAULT_TASK_RETENTION_PERIOD_MS,
  });
  services.set(ITaskManager, taskManager);

  // ==========================================================================
  // 2. Tool Registry (from @neko/agent)
  // ==========================================================================
  const toolRegistry = new ToolRegistry();
  services.set(IToolRegistry, toolRegistry);

  // ==========================================================================
  // 3. Create Platform (with injected toolRegistry and file-based user config)
  // ==========================================================================
  const userConfigManager = new FileUserConfigManager();
  context.subscriptions.push({ dispose: () => userConfigManager.dispose() });

  const platform = createPlatform({
    workspacePath,
    taskManager,
    toolRegistry,
    userConfigManager,
  });
  services.set(IPlatform, platform);

  const piAgentRuntimeManager = new VSCodePiRuntimeManager({
    userDataRoot: defaultOpenNekoUserDataRoot(nodeOs.homedir()),
    workspaceId: taskPersistence?.workspaceId ?? 'vscode-empty-window',
    hostId: `vscode:${process.pid}`,
    ...(workspacePath ? { workspaceRoot: workspacePath } : {}),
    builtinSkillRoot: join(context.extensionUri.fsPath, 'dist', 'skills'),
    credentials: piCredentials.credentials,
    tools: toolRegistry,
    assetLoader: {
      load: (ref) =>
        createLocalPerceptionAssetLoader(getCapabilityRuntimeBindings().contentAccessRuntime).load(
          ref,
        ),
      loadBatch: (refs, options) => {
        const loader = createLocalPerceptionAssetLoader(
          getCapabilityRuntimeBindings().contentAccessRuntime,
        );
        if (!loader.loadBatch) {
          throw new Error('Extension perception asset loader lacks batch projection.');
        }
        return loader.loadBatch(refs, options);
      },
    },
    workspaceTrusted: () => vscode.workspace.isTrusted,
  });
  services.set(IPiAgentRuntimeManager, piAgentRuntimeManager);
  const piPurposeModelRuntime = new VSCodePiPurposeModelRuntime({
    credentials: piCredentials.credentials,
    config: platform.config,
  });
  const productPurposeTextRuntime: ICapabilityPurposeTextRuntime = {
    complete: (input) => {
      if (!isDirectProductTextPurpose(input.purpose)) {
        throw new Error(`Purpose ${input.purpose} is not a bounded product text purpose.`);
      }
      return piPurposeModelRuntime.complete({
        purpose: input.purpose,
        systemPrompt: input.instruction,
        prompt: input.input,
        ...(input.signal ? { signal: input.signal } : {}),
      });
    },
  };
  services.set(IProductPurposeTextRuntime, productPurposeTextRuntime);

  // ==========================================================================
  // 4. MCP Manager
  // ==========================================================================
  const mcpManager = new MCPManager();

  // Register MCP servers from platform config
  const mcpServerConfigs = platform.config.getEnabledMCPServers();
  for (const serverConfig of mcpServerConfigs) {
    mcpManager.register(serverConfig);
  }

  services.set(IMCPManager, mcpManager);

  // Connect MCP servers in background
  connectMCPServersRuntime({
    mcpManager,
    toolRegistry,
    externalResearch: platform.config.getEffectiveAgentWorkspaceConfigSnapshot().externalResearch,
    logger,
  }).catch((error) => {
    logger.error('Failed to connect MCP servers:', error);
  });

  // ==========================================================================
  // 5. Agent Manager
  // ==========================================================================
  const agentManager = new AgentManager(piAgentRuntimeManager);
  services.set(IAgentManager, agentManager);

  const taskLifecycleCoordinator = new TaskLifecycleCoordinator({
    interruptions: agentManager,
    tasks: {
      list: () => taskManager.list(),
    },
    taskCancellation: {
      cancel: (scope) => taskManager.cancel(scope),
    },
  });
  services.set(ITaskLifecycleCoordinator, taskLifecycleCoordinator);

  // ==========================================================================
  // 6. Editor Registry
  // ==========================================================================
  const editorRegistry = new EditorRegistry();
  services.set(IEditorRegistry, editorRegistry);

  return {
    platform,
    toolRegistry,
    mcpManager,
    taskManager,
    agentManager,
    piCredentialStore: piCredentials.credentials,
    piProviderAuthController: piCredentials.auth,
    piAuthInteraction: piCredentials.interaction,
    piAgentRuntimeManager,
    productPurposeTextRuntime,
    taskLifecycleCoordinator,
    editorRegistry,
  };
}

function isDirectProductTextPurpose(
  purpose: string,
): purpose is 'canvas.prompt' | 'canvas.judge' | 'character.dialogue' | 'character.profile' {
  return (
    purpose === 'canvas.prompt' ||
    purpose === 'canvas.judge' ||
    purpose === 'character.dialogue' ||
    purpose === 'character.profile'
  );
}

// =============================================================================
// Logging
// =============================================================================

export function logServicesStatus(result: IServiceBootstrapResult): void {
  logger.info('Services initialized:', {
    platform: !!result.platform,
    mcpManager: result.mcpManager.listServers().length + ' servers',
    taskManager: !!result.taskManager,
    agentManager: !!result.agentManager,
    piCredentialStore: !!result.piCredentialStore,
  });
}
