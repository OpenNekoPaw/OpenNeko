import type { DshAcpSessionEventNotification } from '@neko/agent-contracts/dsh-acp';
import {
  DshPermissionOwner,
  type AgentConversationContextAuthorityPort,
  type ConversationDshSessionBindingStore,
} from '@neko/agent-runtime/application';
import type {
  DshAcpApplicationClientHandlers,
  DshAcpSessionUpdateNotification,
} from '@neko/agent-runtime/acp';
import type { GenerationApplicationRuntime } from '@neko/generation/job';
import type { CutProjectAuthoringService } from '@neko/cut-domain';
import type { CutExportApplicationService } from '@neko/cut-node';
import type { CharacterDshAuthoringService } from '@neko/chara/application';
import type { DesktopWorkspaceGrantAuthorityPort } from '@neko/host/desktop-workspace-grant-authority';
import type { WorkspaceConfigManagerAuthority } from '@neko/host/settings';

import type { DesktopDshAgentHandlerAssembly } from './desktop-dsh-agent-runtime';
import { createDesktopDshDomainToolHandlers } from './desktop-dsh-domain-tool-handlers';

export interface DesktopDshProductHandlerAssembly extends DesktopDshAgentHandlerAssembly {
  readonly permissions: DshPermissionOwner;
}

export function createDesktopDshProductHandlers(options: {
  readonly bindings: ConversationDshSessionBindingStore;
  readonly contexts: Pick<AgentConversationContextAuthorityPort, 'readContext'>;
  readonly workspaceGrants: Pick<DesktopWorkspaceGrantAuthorityPort, 'resolveAuthorizedWorkspace'>;
  readonly generationRuntime: Pick<GenerationApplicationRuntime, 'getJobs'>;
  readonly configuration: Pick<
    WorkspaceConfigManagerAuthority,
    'getApplicationConfig' | 'getWorkspaceConfig'
  >;
  readonly assistant: {
    readonly assistantSpaceId: string;
    readonly root: string;
  };
  readonly cutRuntime: {
    resolveExportService(input: {
      readonly workspaceId: string;
      readonly workspacePath: string;
      readonly authoring: Pick<CutProjectAuthoringService, 'query' | 'apply'>;
    }): CutExportApplicationService;
  };
  readonly character?: {
    resolveService(input: {
      readonly workspaceId: string;
      readonly workspacePath: string;
      readonly projectId: string;
      readonly characterProjectId: string;
    }): Promise<Pick<CharacterDshAuthoringService, 'query' | 'fillDraft'>>;
  };
  readonly onPermissionChanged: (conversationId: string) => Promise<void> | void;
  readonly onSessionUpdate: (notification: DshAcpSessionUpdateNotification) => Promise<void> | void;
  readonly onSessionEvent: (notification: DshAcpSessionEventNotification) => Promise<void> | void;
}): DesktopDshProductHandlerAssembly {
  const domainTools = createDesktopDshDomainToolHandlers(options);
  const permissions = new DshPermissionOwner({
    bindings: options.bindings,
    onChanged: options.onPermissionChanged,
  });
  const handlers: DshAcpApplicationClientHandlers = {
    requestPermission(request, identity) {
      if (
        request.sessionId !== identity.sessionId ||
        request.toolCall.toolCallId !== identity.toolCallId
      ) {
        throw new Error('DSH ACP permission projection returned a mismatched identity.');
      }
      return permissions.request({ request, turn: identity.turn });
    },
    executeGenerationTool: (request, signal) => domainTools.executeGenerationTool(request, signal),
    executeCanvasTool: (request, signal) => domainTools.executeCanvasTool(request, signal),
    executeCutTool: (request, signal) => domainTools.executeCutTool(request, signal),
    executeDocumentTool: (request, signal) => domainTools.executeDocumentTool(request, signal),
    executeCharacterTool: (request, signal) => domainTools.executeCharacterTool(request, signal),
    onSessionUpdate: options.onSessionUpdate,
    onSessionEvent: options.onSessionEvent,
  };
  return Object.freeze({
    handlers: Object.freeze(handlers),
    permissions,
    reset: () => permissions.reset(),
    dispose: () => permissions.dispose(),
  });
}
