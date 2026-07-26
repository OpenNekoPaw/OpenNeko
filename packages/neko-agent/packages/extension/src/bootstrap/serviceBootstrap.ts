/**
 * Service Bootstrap for NekoAgent
 *
 * Initializes core services for the AI Agent extension.
 * Simplified version focused on agent-specific services.
 */

import * as vscode from 'vscode';
import * as nodeOs from 'node:os';
import { join } from 'node:path';
import {
  Platform,
  createContentReadMediaRequestAssetMaterializer,
  createPlatform,
  FileUserConfigManager,
} from '@neko/platform';
import { MCPManager, ToolRegistry, connectMCPServersRuntime } from '@neko/agent';
import type {
  AuthInteraction,
  OpenNekoCredentialStore,
  PiProviderAuthController,
} from '@neko/agent/pi';
import type { ICapabilityPurposeTextRuntime } from '@neko/shared';
import { createNodeHostContentReadService } from '@neko/shared/content-access';
import { ServiceCollection, createServiceId, getLogger } from '../base';

const logger = getLogger('ServiceBootstrap');
import { IEditorRegistry, EditorRegistry } from '../editor/common/editorRegistry';
import { AgentManager, IAgentManager as IAgentManagerInterface } from '../ai/agentManager';
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

// =============================================================================
// Service Bootstrap Result
// =============================================================================

export interface IServiceBootstrapResult {
  platform: Platform;
  toolRegistry: ToolRegistry;
  mcpManager: MCPManager;
  agentManager: AgentManager;
  piCredentialStore: OpenNekoCredentialStore;
  piProviderAuthController: PiProviderAuthController;
  piAuthInteraction: AuthInteraction;
  piAgentRuntimeManager: VSCodePiRuntimeManager;
  productPurposeTextRuntime: ICapabilityPurposeTextRuntime;
  editorRegistry: EditorRegistry;
}

export interface ExtensionAgentBootstrapMetadata {
  readonly workspaceId?: string;
}

export interface ExtensionAgentHostRuntime {
  readonly platform: Platform;
  readonly toolRegistry: ToolRegistry;
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
  metadata?: ExtensionAgentBootstrapMetadata,
  hostRuntime?: ExtensionAgentHostRuntime,
): Promise<IServiceBootstrapResult> {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const piCredentials = createVSCodePiCredentialRuntime(
    defaultOpenNekoUserDataRoot(nodeOs.homedir()),
  );
  services.set(IPiCredentialStore, piCredentials.credentials);
  services.set(IPiProviderAuthController, piCredentials.auth);
  services.set(IPiAuthInteraction, piCredentials.interaction);

  // ==========================================================================
  // 1. Tool Registry (from @neko/agent)
  // ==========================================================================
  const toolRegistry = hostRuntime?.toolRegistry ?? new ToolRegistry();
  services.set(IToolRegistry, toolRegistry);

  // ==========================================================================
  // 2. Create Platform (with injected toolRegistry and file-based user config)
  // ==========================================================================
  const platform =
    hostRuntime?.platform ??
    createPlatform({
      workspacePath,
      toolRegistry,
      userConfigManager: createOwnedUserConfigManager(context),
      ...(workspacePath
        ? {
            requestAssetMaterializer: createContentReadMediaRequestAssetMaterializer({
              contentRead: createNodeHostContentReadService({ workspaceRoot: workspacePath }),
              encodeBase64: (bytes) => Buffer.from(bytes).toString('base64'),
            }),
          }
        : {}),
    });
  services.set(IPlatform, platform);

  const piAgentRuntimeManager = new VSCodePiRuntimeManager({
    userDataRoot: defaultOpenNekoUserDataRoot(nodeOs.homedir()),
    workspaceId: metadata?.workspaceId ?? 'vscode-empty-window',
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
  // 3. MCP Manager
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
  // 4. Agent Manager
  // ==========================================================================
  const agentManager = new AgentManager(piAgentRuntimeManager);
  services.set(IAgentManager, agentManager);

  // ==========================================================================
  // 5. Editor Registry
  // ==========================================================================
  const editorRegistry = new EditorRegistry();
  services.set(IEditorRegistry, editorRegistry);

  return {
    platform,
    toolRegistry,
    mcpManager,
    agentManager,
    piCredentialStore: piCredentials.credentials,
    piProviderAuthController: piCredentials.auth,
    piAuthInteraction: piCredentials.interaction,
    piAgentRuntimeManager,
    productPurposeTextRuntime,
    editorRegistry,
  };
}

function createOwnedUserConfigManager(context: vscode.ExtensionContext): FileUserConfigManager {
  const userConfigManager = new FileUserConfigManager();
  context.subscriptions.push({ dispose: () => userConfigManager.dispose() });
  return userConfigManager;
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
    agentManager: !!result.agentManager,
    piCredentialStore: !!result.piCredentialStore,
  });
}
