import type {
  AgentConversationContextAuthorityPort,
  ConversationDshSessionBindingStore,
} from '@neko/agent-runtime/application';
import { createDshDomainToolContextResolver } from '@neko/agent-runtime/application';
import { createDshDomainToolHandlers, type DshDomainToolHandlers } from '@neko/agent-runtime/acp';
import { CanvasProjectAuthoringService } from '@neko/canvas-domain';
import {
  createNodeHostContentReadService,
  NodeAuthorizedWorkspaceWriter,
} from '@neko/content/node';
import { CutProjectAuthoringService } from '@neko/cut-domain';
import type { CutExportApplicationService } from '@neko/cut-node';
import {
  createPurposeGenerationJobPort,
  type GenerationApplicationRuntime,
} from '@neko/generation/job';
import type { DesktopWorkspaceGrantAuthorityPort } from '@neko/host/desktop-workspace-grant-authority';
import type { ConfigManager, WorkspaceConfigManagerAuthority } from '@neko/host/settings';

export function createDesktopDshDomainToolHandlers(options: {
  readonly bindings: Pick<ConversationDshSessionBindingStore, 'getByDshSessionId'>;
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
  readonly cutRuntime?: {
    resolveExportService(input: {
      readonly workspaceId: string;
      readonly workspacePath: string;
      readonly authoring: Pick<CutProjectAuthoringService, 'query' | 'apply'>;
    }): CutExportApplicationService;
  };
}): DshDomainToolHandlers {
  const contexts = createDshDomainToolContextResolver({
    bindings: options.bindings,
    contexts: options.contexts,
  });
  return createDshDomainToolHandlers({
    contexts,
    generation: {
      resolveJobs: async (context) => {
        if (context.binding.kind === 'assistant') {
          if (context.binding.assistantSpaceId !== options.assistant.assistantSpaceId) {
            throw Object.assign(
              new Error(
                `Assistant Space '${context.binding.assistantSpaceId}' is not authorized by this Host.`,
              ),
              { code: 'GENERATION_DSH_ASSISTANT_UNAUTHORIZED' },
            );
          }
          return createPurposeGenerationJobPort({
            jobs: await options.generationRuntime.getJobs({
              owner: {
                kind: 'assistant',
                assistantSpaceId: context.binding.assistantSpaceId,
              },
              root: options.assistant.root,
            }),
            bindings: purposeBindings(options.configuration.getApplicationConfig()),
          });
        }
        if (context.binding.kind !== 'workspace') {
          throw Object.assign(
            new Error(
              `Generation is unavailable for ${context.binding.kind} Conversation context.`,
            ),
            { code: 'GENERATION_DSH_CONTEXT_UNSUPPORTED' },
          );
        }
        const resolution = await options.workspaceGrants.resolveAuthorizedWorkspace(
          context.binding.workspaceGrantId,
          context.binding.workspaceId,
        );
        return createPurposeGenerationJobPort({
          jobs: await options.generationRuntime.getJobs({
            owner: { kind: 'workspace', workspaceId: resolution.workspace.workspaceId },
            root: resolution.workspace.workspacePath,
          }),
          bindings: purposeBindings(
            options.configuration.getWorkspaceConfig({
              workspaceId: resolution.workspace.workspaceId,
              workspacePath: resolution.workspace.workspacePath,
            }),
          ),
        });
      },
    },
    canvas: {
      resolveService: async (context) => {
        const resolution = await options.workspaceGrants.resolveAuthorizedWorkspace(
          context.binding.workspaceGrantId,
          context.binding.workspaceId,
        );
        return new CanvasProjectAuthoringService({
          contentRead: createNodeHostContentReadService({
            workspaceRoot: resolution.workspace.workspacePath,
          }),
          workspaceWriter: new NodeAuthorizedWorkspaceWriter({
            workspaceRoot: resolution.workspace.workspacePath,
          }),
        });
      },
    },
    cut: {
      resolveService: async (context) => {
        const resolution = await options.workspaceGrants.resolveAuthorizedWorkspace(
          context.binding.workspaceGrantId,
          context.binding.workspaceId,
        );
        const authoring = new CutProjectAuthoringService({
          contentRead: createNodeHostContentReadService({
            workspaceRoot: resolution.workspace.workspacePath,
          }),
          workspaceWriter: new NodeAuthorizedWorkspaceWriter({
            workspaceRoot: resolution.workspace.workspacePath,
          }),
        });
        if (!options.cutRuntime) return authoring;
        const exportService = options.cutRuntime.resolveExportService({
          workspaceId: resolution.workspace.workspaceId,
          workspacePath: resolution.workspace.workspacePath,
          authoring,
        });
        return {
          query: authoring.query.bind(authoring),
          apply: authoring.apply.bind(authoring),
          submit: exportService.submit.bind(exportService),
          describe: exportService.describe.bind(exportService),
          cancel: exportService.cancel.bind(exportService),
        };
      },
    },
  });
}

function purposeBindings(config: Pick<ConfigManager, 'resolveModelRefForPurpose'>) {
  return {
    resolveGenerationBinding(purpose: string) {
      return config.resolveModelRefForPurpose(purpose);
    },
  };
}
