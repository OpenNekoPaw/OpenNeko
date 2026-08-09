import type {
  AutomationMode,
  AutomationProviderIdentity,
  AutomationTarget,
} from '@neko/automation-contracts';
import type { AutomationProviderExecutionResult, AutomationProviderPort } from './index';
import { digestAutomationInputSchema } from './schema-digest';

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

export function createReviewedMcpAutomationProvider(options: {
  readonly identity: AutomationProviderIdentity;
  readonly allowedOperations: readonly string[];
  readonly runtime: AutomationMcpRuntimePort;
  readonly resultProjector: AutomationMcpResultProjector;
}): AutomationProviderPort {
  const allowedOperations = new Set(options.allowedOperations);
  if (allowedOperations.size !== options.allowedOperations.length) {
    throw new Error('Automation MCP operation allowlist contains duplicates.');
  }

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
          inputSchemaDigest: digestAutomationInputSchema(tool.inputSchema),
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
    openSession: (input) => options.runtime.openSession(input),
    revalidateTarget: (input) => options.runtime.revalidateTarget(input),
    async execute(input) {
      if (!allowedOperations.has(input.operation)) {
        throw new Error(`Automation MCP operation '${input.operation}' is not reviewed.`);
      }
      const result = await options.runtime.callTool({
        providerSessionId: input.providerSessionId,
        name: input.operation,
        arguments: input.arguments,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      return options.resultProjector.project({ operation: input.operation, result });
    },
    closeSession: (providerSessionId) => options.runtime.closeSession(providerSessionId),
  };
  return Object.freeze(provider);
}
