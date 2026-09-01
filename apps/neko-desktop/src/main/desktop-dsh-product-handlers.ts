import type {
  DshAcpContextPressureNotification,
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
  DshAcpSessionEventNotification,
} from '@neko/agent-contracts/dsh-acp';
import { CREATE_SKILL_DSH_TOOL_NAME } from '@neko/agent-contracts/dsh-skill-authoring';
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
import { GENERATION_DSH_TOOL_NAME } from '@neko/generation-domain';
import { CUT_DSH_TOOL_NAME, type CutProjectAuthoringService } from '@neko/cut-domain';
import type { CutExportApplicationService } from '@neko/cut-node';
import {
  CHARACTER_DSH_TOOL_NAME,
  type CharacterDshAuthoringService,
} from '@neko/chara-domain/application';
import { WORLD_DSH_TOOL_NAME, type WorldDshAuthoringService } from '@neko/world-domain/application';
import { CANVAS_DSH_TOOL_NAME, type CanvasWorkspaceTurnTarget } from '@neko/canvas-domain';
import { CONTENT_IMAGE_DSH_TOOL_NAME } from '@neko/content-domain';
import { DOCUMENT_DSH_TOOL_NAME } from '@neko/content-domain/document';
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
  readonly coordinateCanvasMutation: <TResult>(
    target: CanvasWorkspaceTurnTarget,
    operation: () => Promise<TResult>,
  ) => Promise<TResult>;
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
    readonly bindings: Pick<ProfessionalApplicationBindingRepository, 'get' | 'getEnabled'>;
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
    executeDomainTool: (request, signal) => executeDomainTool(domainTools, request, signal),
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

async function executeDomainTool(
  handlers: ReturnType<typeof createDesktopDshDomainToolHandlers>,
  request: DshAcpDomainToolRequest,
  signal: AbortSignal,
): Promise<DshAcpDomainToolResponse> {
  switch (request.tool) {
    case GENERATION_DSH_TOOL_NAME:
      return handlers.executeGenerationTool(request, signal);
    case CANVAS_DSH_TOOL_NAME:
      return handlers.executeCanvasTool(request, signal);
    case CUT_DSH_TOOL_NAME:
      return handlers.executeCutTool(request, signal);
    case DOCUMENT_DSH_TOOL_NAME:
      return handlers.executeDocumentTool(request, signal);
    case CONTENT_IMAGE_DSH_TOOL_NAME:
      return handlers.executeContentImageTool(request, signal);
    case CHARACTER_DSH_TOOL_NAME:
      return handlers.executeCharacterTool(request, signal);
    case WORLD_DSH_TOOL_NAME:
      return handlers.executeWorldTool(request, signal);
    case CREATE_SKILL_DSH_TOOL_NAME:
      return handlers.executeSkillAuthoringTool(request, signal);
    default:
      throw new Error(`DSH ACP requested unsupported domain tool ${request.tool}.`);
  }
}
