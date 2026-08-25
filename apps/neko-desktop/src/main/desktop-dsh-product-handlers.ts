import type {
  DshAcpContextPressureNotification,
  DshAcpSessionEventNotification,
} from '@neko/agent-contracts/dsh-acp';
import {
  DshPermissionOwner,
  type AgentConversationContextAuthorityPort,
  type ConversationDshSessionBindingStore,
  type DshSkillAuthoringService,
} from '@neko/agent-runtime/application';
import type {
  DshAcpApplicationClientHandlers,
  DshAcpSessionUpdateNotification,
  DshAcpSessionUpdateDelivery,
} from '@neko/agent-runtime/acp';
import type { GenerationApplicationRuntime } from '@neko/generation-domain/job';
import type { CutProjectAuthoringService } from '@neko/cut-domain';
import type { CutExportApplicationService } from '@neko/cut-node';
import type { CharacterDshAuthoringService } from '@neko/chara-domain/application';
import type { WorldDshAuthoringService } from '@neko/world-domain/application';
import type { DesktopWorkspaceGrantAuthorityPort } from '@neko/host/desktop-workspace-grant-authority';
import type { WorkspaceConfigManagerAuthority } from '@neko/host/settings';
import type { ProfessionalApplicationBindingRepository } from '@neko/professional-apps-node';

import type { DesktopDshAgentHandlerAssembly } from './desktop-dsh-agent-runtime';
import {
  createDesktopDshDomainToolHandlers,
  type DesktopDshGenerationProjectionPort,
} from './desktop-dsh-domain-tool-handlers';

export interface DesktopDshProductHandlerAssembly extends DesktopDshAgentHandlerAssembly {
  readonly permissions: DshPermissionOwner;
}

export function createDesktopDshProductHandlers(options: {
  readonly bindings: ConversationDshSessionBindingStore;
  readonly contexts: Pick<AgentConversationContextAuthorityPort, 'readContext'>;
  readonly workspaceGrants: Pick<DesktopWorkspaceGrantAuthorityPort, 'resolveAuthorizedWorkspace'>;
  readonly generationRuntime: Pick<GenerationApplicationRuntime, 'getJobs'>;
  readonly generationProjection: DesktopDshGenerationProjectionPort;
  readonly configuration: Pick<
    WorkspaceConfigManagerAuthority,
    'getApplicationConfig' | 'getWorkspaceConfig'
  >;
  readonly assistant: {
    readonly assistantSpaceId: string;
    readonly root: string;
  };
  readonly skillAuthoring: Pick<DshSkillAuthoringService, 'create'>;
  readonly comfyUi?: {
    readonly bindings: Pick<ProfessionalApplicationBindingRepository, 'get'>;
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
  readonly world?: {
    resolveService(input: {
      readonly workspaceId: string;
      readonly workspacePath: string;
      readonly projectId: string;
      readonly worldProjectId: string;
    }): Promise<Pick<WorldDshAuthoringService, 'query' | 'fillDraft'>>;
  };
  readonly onPermissionChanged: (conversationId: string) => Promise<void> | void;
  readonly onSessionUpdate: (
    notification: DshAcpSessionUpdateNotification,
    delivery: DshAcpSessionUpdateDelivery,
  ) => Promise<void> | void;
  readonly onSessionEvent: (notification: DshAcpSessionEventNotification) => Promise<void> | void;
  readonly onContextPressure: (
    notification: DshAcpContextPressureNotification,
  ) => Promise<void> | void;
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
    executeContentImageTool: (request, signal) =>
      domainTools.executeContentImageTool(request, signal),
    executeCharacterTool: (request, signal) => domainTools.executeCharacterTool(request, signal),
    executeWorldTool: (request, signal) => domainTools.executeWorldTool(request, signal),
    executeSkillAuthoringTool: (request, signal) =>
      domainTools.executeSkillAuthoringTool(request, signal),
    onSessionUpdate: options.onSessionUpdate,
    onSessionEvent: options.onSessionEvent,
    onContextPressure: options.onContextPressure,
  };
  return Object.freeze({
    handlers: Object.freeze(handlers),
    permissions,
    reset: () => permissions.reset(),
    dispose: () => permissions.dispose(),
  });
}
