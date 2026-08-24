import type {
  AgentConversationContextAuthorityPort,
  ConversationDshSessionBindingStore,
} from '@neko/agent-runtime/application';
import type { AgentConversationContext } from '@neko/agent-contracts';
import type { DshAcpDomainToolRequest } from '@neko/agent-contracts/dsh-acp';
import { createHostAgentContentAccessRuntime } from '@neko/agent-runtime/runtime';
import {
  createDshDomainToolContextResolver,
  type DshDomainToolContext,
} from '@neko/agent-runtime/application';
import {
  createDshDomainToolHandlers,
  type DshDomainToolHandlers,
  type GenerationDshLifecycleProjectionOutcome,
} from '@neko/agent-runtime/acp';
import { CanvasProjectAuthoringService } from '@neko/canvas-domain';
import {
  createNodeHostContentReadService,
  createNodeDocumentAccessService,
  NodeAuthorizedWorkspaceWriter,
} from '@neko/content/node';
import { createNodeDocumentLowLevelAccess } from '@neko/content/document/node';
import { join } from 'node:path';
import { CutProjectAuthoringService } from '@neko/cut-domain';
import type { CutExportApplicationService } from '@neko/cut-node';
import {
  createPurposeGenerationJobPort,
  type GenerationApplicationRuntime,
  type GenerationJobSnapshot,
} from '@neko/generation/job';
import { createHash } from 'node:crypto';
import type { ProfessionalApplicationBindingRepository } from '@neko/professional-apps-node';
import type { DesktopWorkspaceGrantAuthorityPort } from '@neko/host/desktop-workspace-grant-authority';
import type { ConfigManager, WorkspaceConfigManagerAuthority } from '@neko/host/settings';
import type { CharacterDshAuthoringService } from '@neko/chara/application';
import type { WorldDshAuthoringService } from '@neko/world/application';
import type { DshSkillAuthoringService } from '@neko/agent-runtime/application';

export interface DesktopDshGenerationProjectionPort {
  projectSnapshot(input: {
    readonly context: DshDomainToolContext;
    readonly request: DshAcpDomainToolRequest;
    readonly snapshot: GenerationJobSnapshot;
  }): Promise<GenerationDshLifecycleProjectionOutcome>;
}

export function createDesktopDshDomainToolHandlers(options: {
  readonly bindings: Pick<ConversationDshSessionBindingStore, 'getByDshSessionId'>;
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
  readonly skillAuthoring?: Pick<DshSkillAuthoringService, 'create'>;
  readonly comfyUi?: {
    readonly bindings: Pick<ProfessionalApplicationBindingRepository, 'get'>;
  };
  readonly cutRuntime?: {
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
}): DshDomainToolHandlers {
  const contexts = createDshDomainToolContextResolver({
    bindings: options.bindings,
    contexts: options.contexts,
  });
  const resolveGenerationOwner = async (context: DshDomainToolContext) => {
    if (context.binding.kind === 'assistant') {
      if (context.binding.assistantSpaceId !== options.assistant.assistantSpaceId) {
        throw Object.assign(
          new Error(
            `Assistant Space '${context.binding.assistantSpaceId}' is not authorized by this Host.`,
          ),
          { code: 'GENERATION_DSH_ASSISTANT_UNAUTHORIZED' },
        );
      }
      return {
        jobs: await options.generationRuntime.getJobs({
          owner: {
            kind: 'assistant' as const,
            assistantSpaceId: context.binding.assistantSpaceId,
          },
          root: options.assistant.root,
        }),
        config: options.configuration.getApplicationConfig(),
      };
    }
    if (context.binding.kind !== 'workspace' && context.binding.kind !== 'authoring') {
      throw Object.assign(
        new Error(`Generation is unavailable for ${context.binding.kind} Conversation context.`),
        { code: 'GENERATION_DSH_CONTEXT_UNSUPPORTED' },
      );
    }
    const workspaceContext = asWorkspaceContext(context);
    const resolution = await options.workspaceGrants.resolveAuthorizedWorkspace(
      workspaceContext.binding.workspaceGrantId,
      workspaceContext.binding.workspaceId,
    );
    return {
      jobs: await options.generationRuntime.getJobs({
        owner: { kind: 'workspace' as const, workspaceId: resolution.workspace.workspaceId },
        root: resolution.workspace.workspacePath,
      }),
      config: options.configuration.getWorkspaceConfig({
        workspaceId: resolution.workspace.workspaceId,
        workspacePath: resolution.workspace.workspacePath,
      }),
    };
  };
  return createDshDomainToolHandlers({
    contexts,
    skillAuthoring: options.skillAuthoring,
    generation: {
      projectSnapshot: (input) => options.generationProjection.projectSnapshot(input),
      resolveJobs: async (context) => {
        const resolved = await resolveGenerationOwner(context);
        return createPurposeGenerationJobPort({
          jobs: resolved.jobs,
          bindings: purposeBindings(resolved.config),
        });
      },
      ...(options.comfyUi
        ? {
            submitComfyUi: async ({ context, request, submission }) => {
              const binding = await options.comfyUi!.bindings.get('comfyui');
              if (!binding?.endpoint) {
                throw Object.assign(
                  new Error('ComfyUI requires an explicit configured loopback endpoint.'),
                  { code: 'GENERATION_DSH_COMFYUI_UNCONFIGURED' },
                );
              }
              const resolved = await resolveGenerationOwner(context);
              const clientDigest = createHash('sha256')
                .update(`${request.sessionId}\0${request.turn}\0${request.toolCallId}`)
                .digest('hex')
                .slice(0, 24);
              const snapshot = await resolved.jobs.submitGeneration({
                lifecycleMode: submission.lifecycleMode,
                generationType: 'workflow',
                providerId: 'comfyui',
                request: {
                  endpoint: binding.endpoint,
                  clientId: `openneko-${clientDigest}`,
                  workflow: submission.workflow,
                  outputKind: submission.outputKind,
                  inputBindings: submission.inputBindings,
                },
              });
              return { snapshot, jobs: resolved.jobs };
            },
          }
        : {}),
    },
    canvas: {
      resolveService: async (context) => {
        const workspaceContext = asWorkspaceContext(context);
        const resolution = await options.workspaceGrants.resolveAuthorizedWorkspace(
          workspaceContext.binding.workspaceGrantId,
          workspaceContext.binding.workspaceId,
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
        const workspaceContext = asWorkspaceContext(context);
        const resolution = await options.workspaceGrants.resolveAuthorizedWorkspace(
          workspaceContext.binding.workspaceGrantId,
          workspaceContext.binding.workspaceId,
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
    document: {
      resolveRuntime: async (context) => {
        const root =
          context.binding.kind === 'assistant'
            ? options.assistant.root
            : context.binding.kind === 'workspace' || context.binding.kind === 'authoring'
              ? (
                  await options.workspaceGrants.resolveAuthorizedWorkspace(
                    context.binding.workspaceGrantId,
                    context.binding.workspaceId,
                  )
                ).workspace.workspacePath
              : (() => {
                  throw Object.assign(
                    new Error(
                      `Document access is unavailable for ${context.binding.kind} Conversation context.`,
                    ),
                    { code: 'DOCUMENT_DSH_CONTEXT_UNSUPPORTED' },
                  );
                })();
        const documentEntryAccess = createNodeDocumentLowLevelAccess();
        return createHostAgentContentAccessRuntime({
          contentRead: createNodeHostContentReadService({
            workspaceRoot: root,
            documentEntryReader: {
              readEntry: (sourcePath, entryPath) =>
                documentEntryAccess.readEntry(sourcePath, entryPath),
            },
          }),
          documentAccess: createNodeDocumentAccessService(),
          resolveDocumentHostFilePath: (source) => join(root, ...source.file.path.split('/')),
        });
      },
    },
    character: {
      resolveService: async (context) => {
        if (
          context.binding.kind !== 'authoring' ||
          context.binding.target?.kind !== 'character-project'
        ) {
          throw diagnosticError(
            'CHARACTER_DSH_CONTEXT_UNSUPPORTED',
            'Character authoring requires an exact CharacterProject Conversation target.',
          );
        }
        const resolution = await options.workspaceGrants.resolveAuthorizedWorkspace(
          context.binding.workspaceGrantId,
          context.binding.workspaceId,
        );
        if (resolution.workspace.workspaceId !== context.binding.workspaceId) {
          throw diagnosticError(
            'CHARACTER_DSH_WORKSPACE_MISMATCH',
            'Character authoring Workspace authority does not match the Conversation binding.',
          );
        }
        if (options.character === undefined) {
          throw diagnosticError(
            'CHARACTER_DSH_SERVICE_UNAVAILABLE',
            'Character DSH authoring service is not composed by Desktop.',
          );
        }
        return options.character.resolveService({
          workspaceId: resolution.workspace.workspaceId,
          workspacePath: resolution.workspace.workspacePath,
          projectId: context.binding.authority.projectId,
          characterProjectId: context.binding.target.characterProjectId,
        });
      },
    },
    world: {
      resolveService: async (context) => {
        if (
          context.binding.kind !== 'authoring' ||
          context.binding.target?.kind !== 'world-project'
        ) {
          throw diagnosticError(
            'WORLD_DSH_CONTEXT_UNSUPPORTED',
            'World authoring requires an exact WorldProject Conversation target.',
          );
        }
        const resolution = await options.workspaceGrants.resolveAuthorizedWorkspace(
          context.binding.workspaceGrantId,
          context.binding.workspaceId,
        );
        if (resolution.workspace.workspaceId !== context.binding.workspaceId) {
          throw diagnosticError(
            'WORLD_DSH_WORKSPACE_MISMATCH',
            'World authoring Workspace authority does not match the Conversation binding.',
          );
        }
        if (options.world === undefined) {
          throw diagnosticError(
            'WORLD_DSH_SERVICE_UNAVAILABLE',
            'World DSH authoring service is not composed by Desktop.',
          );
        }
        return options.world.resolveService({
          workspaceId: resolution.workspace.workspaceId,
          workspacePath: resolution.workspace.workspacePath,
          projectId: context.binding.authority.projectId,
          worldProjectId: context.binding.target.worldProjectId,
        });
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

function diagnosticError(code: string, message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code });
}

function asWorkspaceContext(
  context: import('@neko/agent-runtime/application').DshDomainToolContext,
): import('@neko/agent-runtime/application').DshDomainToolContext & {
  readonly binding: Extract<AgentConversationContext, { readonly kind: 'workspace' }>;
} {
  if (context.binding.kind === 'workspace') {
    return {
      conversationId: context.conversationId,
      dshSessionId: context.dshSessionId,
      binding: context.binding,
    };
  }
  if (context.binding.kind !== 'authoring') {
    throw new Error(`Conversation context '${context.binding.kind}' is not Workspace-bound.`);
  }
  return {
    ...context,
    binding: {
      kind: 'workspace',
      workspaceId: context.binding.workspaceId,
      workspaceGrantId: context.binding.workspaceGrantId,
    },
  };
}
