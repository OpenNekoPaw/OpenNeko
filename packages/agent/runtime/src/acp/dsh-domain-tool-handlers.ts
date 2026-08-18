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
import type { PurposeGenerationJobPort } from '@neko/generation/job';

import type {
  DshDomainToolContext,
  DshDomainToolContextResolver,
} from '../application/dsh-domain-tool-context-resolver';
import { CanvasDshHostAdapter } from './canvas-host-adapter';
import { CutDshHostAdapter } from './cut-host-adapter';
import { GenerationDshHostAdapter } from './generation-host-adapter';

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
}

export function createDshDomainToolHandlers(options: {
  readonly contexts: DshDomainToolContextResolver;
  readonly generation: {
    resolveJobs(context: DshDomainToolContext): Promise<PurposeGenerationJobPort>;
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
}): DshDomainToolHandlers {
  return Object.freeze({
    async executeGenerationTool(request: DshAcpDomainToolRequest, signal: AbortSignal) {
      return new GenerationDshHostAdapter(async () => {
        const context = await options.contexts.resolve(request.sessionId);
        if (context.binding.kind !== 'workspace' && context.binding.kind !== 'assistant') {
          throw diagnosticError(
            'GENERATION_DSH_CONTEXT_UNSUPPORTED',
            `Generation is unavailable for ${context.binding.kind} Conversation context.`,
          );
        }
        return options.generation.resolveJobs(context);
      }).execute(request, signal);
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
  });
}

function diagnosticError(code: string, message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code });
}
