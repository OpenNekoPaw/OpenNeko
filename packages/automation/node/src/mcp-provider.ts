import type {
  AutomationMode,
  AutomationProviderIdentity,
  AutomationTarget,
} from '@neko/automation-contracts';
import type { AutomationProviderExecutionResult, AutomationProviderPort } from './index';

export interface AutomationMcpToolDefinition {
  readonly name: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations?: {
    readonly readOnlyHint?: boolean;
    readonly destructiveHint?: boolean;
  };
}

export type AutomationMcpResultContent =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image' | 'audio'; readonly data: string; readonly mimeType: string }
  | { readonly type: 'resource' | 'resource_link' };

export interface AutomationMcpCallResult {
  readonly content: readonly AutomationMcpResultContent[];
  readonly structuredContent?: Readonly<Record<string, unknown>>;
  readonly isError?: boolean;
}

/**
 * Owns isolated upstream MCP processes. Every opened Automation session has one
 * exclusive provider session and all calls are routed through that opaque id.
 */
export interface AutomationMcpRuntimePort {
  inspectTools(input: {
    readonly signal?: AbortSignal;
  }): Promise<readonly AutomationMcpToolDefinition[]>;
  openSession(input: {
    readonly sessionId: string;
    readonly target: AutomationTarget;
    readonly mode: AutomationMode;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  }): Promise<{ readonly providerSessionId: string }>;
  revalidateTarget(input: {
    readonly providerSessionId: string;
    readonly expected: AutomationTarget;
    readonly signal?: AbortSignal;
  }): Promise<AutomationTarget>;
  callTool(input: {
    readonly providerSessionId: string;
    readonly name: string;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly signal?: AbortSignal;
  }): Promise<AutomationMcpCallResult>;
  closeSession(providerSessionId: string): Promise<void>;
}

export interface AutomationMcpResultProjector {
  project(input: {
    readonly operation: string;
    readonly result: AutomationMcpCallResult;
  }): AutomationProviderExecutionResult;
}

export interface AutomationMcpArgumentProjector {
  project(input: {
    readonly providerSessionId: string;
    readonly target: AutomationTarget;
    readonly mode: AutomationMode;
    readonly operation: string;
    readonly arguments: Readonly<Record<string, unknown>>;
  }): Readonly<Record<string, unknown>>;
}

export function createReviewedMcpAutomationProvider(options: {
  readonly identity: AutomationProviderIdentity;
  readonly allowedOperations: readonly string[];
  readonly runtime: AutomationMcpRuntimePort;
  readonly resultProjector: AutomationMcpResultProjector;
  readonly argumentProjector?: AutomationMcpArgumentProjector;
}): AutomationProviderPort {
  const allowedOperations = new Set(options.allowedOperations);
  if (allowedOperations.size !== options.allowedOperations.length) {
    throw new Error('Automation MCP operation allowlist contains duplicates.');
  }
  const sessions = new Map<
    string,
    { readonly target: AutomationTarget; readonly mode: AutomationMode }
  >();

  const provider: AutomationProviderPort = {
    identity: options.identity,
    async inspect(signal?: AbortSignal) {
      const tools = await options.runtime.inspectTools({
        ...(signal === undefined ? {} : { signal }),
      });
      return {
        provider: options.identity,
        operations: tools.map((tool) => ({
          name: tool.name,
          inputSchema: tool.inputSchema,
          annotations: {
            ...(tool.annotations?.readOnlyHint === undefined
              ? {}
              : { readOnlyHint: tool.annotations.readOnlyHint }),
            ...(tool.annotations?.destructiveHint === undefined
              ? {}
              : { destructiveHint: tool.annotations.destructiveHint }),
          },
        })),
      };
    },
    async openSession(input) {
      const opened = await options.runtime.openSession(input);
      if (sessions.has(opened.providerSessionId)) {
        const duplicateError = new Error(
          `Automation MCP provider session '${opened.providerSessionId}' is duplicated.`,
        );
        try {
          await options.runtime.closeSession(opened.providerSessionId);
        } catch (closeError) {
          throw new AggregateError(
            [duplicateError, closeError],
            `Automation MCP provider session '${opened.providerSessionId}' duplicated and cleanup failed.`,
          );
        }
        throw duplicateError;
      }
      sessions.set(opened.providerSessionId, {
        target: input.target,
        mode: input.mode,
      });
      return opened;
    },
    revalidateTarget: (input) => options.runtime.revalidateTarget(input),
    async execute(input) {
      if (!allowedOperations.has(input.operation)) {
        throw new Error(`Automation MCP operation '${input.operation}' is not reviewed.`);
      }
      const session = sessions.get(input.providerSessionId);
      if (!session) {
        throw new Error(
          `Automation MCP provider session '${input.providerSessionId}' is unavailable.`,
        );
      }
      const projectedArguments =
        options.argumentProjector?.project({
          providerSessionId: input.providerSessionId,
          target: session.target,
          mode: session.mode,
          operation: input.operation,
          arguments: input.arguments,
        }) ?? input.arguments;
      const result = await options.runtime.callTool({
        providerSessionId: input.providerSessionId,
        name: input.operation,
        arguments: projectedArguments,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      return options.resultProjector.project({ operation: input.operation, result });
    },
    async closeSession(providerSessionId) {
      if (!sessions.has(providerSessionId)) {
        throw new Error(`Automation MCP provider session '${providerSessionId}' is unavailable.`);
      }
      await options.runtime.closeSession(providerSessionId);
      sessions.delete(providerSessionId);
    },
  };
  return Object.freeze(provider);
}
