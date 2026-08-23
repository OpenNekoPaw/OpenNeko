import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
} from '@neko/agent-contracts/dsh-acp';
import type { CanvasProjectAuthoringService } from '@neko/canvas-domain';
import type {
  CutExportSettings,
  CutExportTaskSnapshot,
  CutProjectAuthoringService,
} from '@neko/cut-domain';
import type { GenerationJobSnapshot, PurposeGenerationJobPort } from '@neko/generation/job';
import type { CharacterDshAuthoringService } from '@neko/chara/application';
import type { WorldDshAuthoringService } from '@neko/world/application';
import type { AgentContentAccessRuntime } from '../runtime/capability/agent-content-access-runtime';

import type {
  DshDomainToolContext,
  DshDomainToolContextResolver,
} from '../application/dsh-domain-tool-context-resolver';
import { CanvasDshHostAdapter } from './canvas-host-adapter';
import { CutDshHostAdapter } from './cut-host-adapter';
import {
  GenerationDshHostAdapter,
  type GenerationDshLifecycleProjectionOutcome,
} from './generation-host-adapter';
import { DocumentDshHostAdapter } from './document-host-adapter';
import { ContentImageDshHostAdapter } from './content-image-host-adapter';
import { CharacterDshHostAdapter } from './character-host-adapter';
import { WorldDshHostAdapter } from './world-host-adapter';

export interface DshDomainToolHandlers {
  executeGenerationTool(
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ): Promise<DshAcpDomainToolResponse>;
  executeCanvasTool(
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ): Promise<DshAcpDomainToolResponse>;
  executeCutTool(
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ): Promise<DshAcpDomainToolResponse>;
  executeDocumentTool(
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ): Promise<DshAcpDomainToolResponse>;
  executeContentImageTool(
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ): Promise<DshAcpDomainToolResponse>;
  executeCharacterTool(
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ): Promise<DshAcpDomainToolResponse>;
  executeWorldTool(
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ): Promise<DshAcpDomainToolResponse>;
}

export function createDshDomainToolHandlers(options: {
  readonly contexts: DshDomainToolContextResolver;
  readonly generation: {
    resolveJobs(context: DshDomainToolContext): Promise<PurposeGenerationJobPort>;
    projectSnapshot(input: {
      readonly context: DshDomainToolContext;
      readonly request: DshAcpDomainToolRequest;
      readonly snapshot: GenerationJobSnapshot;
    }): Promise<GenerationDshLifecycleProjectionOutcome>;
  };
  readonly canvas: {
    resolveService(
      context: DshDomainToolContext & {
        readonly binding: Extract<DshDomainToolContext['binding'], { readonly kind: 'workspace' }>;
      },
    ): Promise<Pick<CanvasProjectAuthoringService, 'query' | 'createNode'>>;
  };
  readonly cut: {
    resolveService(
      context: DshDomainToolContext & {
        readonly binding: Extract<DshDomainToolContext['binding'], { readonly kind: 'workspace' }>;
      },
    ): Promise<
      Pick<CutProjectAuthoringService, 'query' | 'apply'> & {
        readonly submit?: (input: {
          readonly documentPath: string;
          readonly sessionId: string;
          readonly outputWorkspaceRelativePath: string;
          readonly settings: CutExportSettings;
          readonly signal?: AbortSignal;
        }) => Promise<CutExportTaskSnapshot>;
        readonly describe?: (input: {
          readonly documentPath: string;
          readonly jobId: string;
        }) => Promise<CutExportTaskSnapshot>;
        readonly cancel?: (input: {
          readonly documentPath: string;
          readonly jobId: string;
        }) => Promise<CutExportTaskSnapshot>;
      }
    >;
  };
  readonly document: {
    resolveRuntime(context: DshDomainToolContext): Promise<AgentContentAccessRuntime>;
  };
  readonly character: {
    resolveService(
      context: DshDomainToolContext & {
        readonly binding: Extract<DshDomainToolContext['binding'], { readonly kind: 'authoring' }>;
      },
    ): Promise<Pick<CharacterDshAuthoringService, 'query' | 'fillDraft'>>;
  };
  readonly world?: {
    resolveService(
      context: DshDomainToolContext & {
        readonly binding: Extract<DshDomainToolContext['binding'], { readonly kind: 'authoring' }>;
      },
    ): Promise<Pick<WorldDshAuthoringService, 'query' | 'fillDraft'>>;
  };
}): DshDomainToolHandlers {
  return Object.freeze({
    async executeGenerationTool(request: DshAcpDomainToolRequest, signal: AbortSignal) {
      let context: Promise<DshDomainToolContext> | undefined;
      const resolveContext = (): Promise<DshDomainToolContext> => {
        context ??= Promise.resolve(options.contexts.resolve(request.sessionId));
        return context;
      };
      return new GenerationDshHostAdapter(
        async () => {
          const resolved = await resolveContext();
          if (
            resolved.binding.kind !== 'workspace' &&
            resolved.binding.kind !== 'assistant' &&
            resolved.binding.kind !== 'authoring'
          ) {
            throw diagnosticError(
              'GENERATION_DSH_CONTEXT_UNSUPPORTED',
              `Generation is unavailable for ${resolved.binding.kind} Conversation context.`,
            );
          }
          return options.generation.resolveJobs(resolved);
        },
        undefined,
        {
          project: async ({ request: projectionRequest, snapshot }) =>
            options.generation.projectSnapshot({
              context: await resolveContext(),
              request: projectionRequest,
              snapshot,
            }),
        },
      ).execute(request, signal);
    },

    async executeCanvasTool(request: DshAcpDomainToolRequest, signal: AbortSignal) {
      return new CanvasDshHostAdapter(async () => {
        const context = await options.contexts.resolve(request.sessionId);
        if (context.binding.kind !== 'workspace') {
          throw diagnosticError(
            'CANVAS_DSH_CONTEXT_UNSUPPORTED',
            `Canvas is unavailable for ${context.binding.kind} Conversation context.`,
          );
        }
        return options.canvas.resolveService({ ...context, binding: context.binding });
      }).execute(request, signal);
    },

    async executeCutTool(request: DshAcpDomainToolRequest, signal: AbortSignal) {
      return new CutDshHostAdapter(async () => {
        const context = await options.contexts.resolve(request.sessionId);
        if (context.binding.kind !== 'workspace') {
          throw diagnosticError(
            'CUT_DSH_CONTEXT_UNSUPPORTED',
            `Cut is unavailable for ${context.binding.kind} Conversation context.`,
          );
        }
        return options.cut.resolveService({ ...context, binding: context.binding });
      }).execute(request, signal);
    },

    async executeDocumentTool(request: DshAcpDomainToolRequest, signal: AbortSignal) {
      return new DocumentDshHostAdapter(async () => {
        const context = await options.contexts.resolve(request.sessionId);
        return options.document.resolveRuntime(context);
      }).execute(request, signal);
    },

    async executeContentImageTool(request: DshAcpDomainToolRequest, signal: AbortSignal) {
      return new ContentImageDshHostAdapter(async () => {
        const context = await options.contexts.resolve(request.sessionId);
        return options.document.resolveRuntime(context);
      }).execute(request, signal);
    },

    async executeCharacterTool(request: DshAcpDomainToolRequest, signal: AbortSignal) {
      return new CharacterDshHostAdapter(async () => {
        const context = await options.contexts.resolve(request.sessionId);
        if (
          context.binding.kind !== 'authoring' ||
          context.binding.target?.kind !== 'character-project'
        ) {
          throw diagnosticError(
            'CHARACTER_DSH_CONTEXT_UNSUPPORTED',
            'Character authoring requires an exact CharacterProject Conversation target.',
          );
        }
        return options.character.resolveService({ ...context, binding: context.binding });
      }).execute(request, signal);
    },

    async executeWorldTool(request: DshAcpDomainToolRequest, signal: AbortSignal) {
      return new WorldDshHostAdapter(async () => {
        const context = await options.contexts.resolve(request.sessionId);
        if (
          context.binding.kind !== 'authoring' ||
          context.binding.target?.kind !== 'world-project'
        ) {
          throw diagnosticError(
            'WORLD_DSH_CONTEXT_UNSUPPORTED',
            'World authoring requires an exact WorldProject Conversation target.',
          );
        }
        if (options.world === undefined) {
          throw diagnosticError(
            'WORLD_DSH_SERVICE_UNAVAILABLE',
            'World DSH authoring service is not composed by Desktop.',
          );
        }
        return options.world.resolveService({ ...context, binding: context.binding });
      }).execute(request, signal);
    },
  });
}

function diagnosticError(code: string, message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code });
}
