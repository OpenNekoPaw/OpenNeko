import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
  DshAcpJsonValue,
} from '@neko/agent-contracts/dsh-acp';
import {
  DOCUMENT_DSH_TOOL_NAME,
  decodeDocumentDshToolInput,
  documentDshJsonValue,
  type DocumentDshToolInput,
} from '@neko/content/document';
import type {
  AgentContentAccessRuntime,
  AgentDocumentContentResult,
} from '../runtime/capability/agent-content-access-runtime';

export class DocumentDshHostAdapter {
  private readonly toolName: string;

  constructor(
    private readonly content:
      AgentContentAccessRuntime | (() => Promise<AgentContentAccessRuntime>),
    toolName: string = DOCUMENT_DSH_TOOL_NAME,
  ) {
    if (toolName !== DOCUMENT_DSH_TOOL_NAME) {
      throw new Error(`Document Host adapter must use exactly ${DOCUMENT_DSH_TOOL_NAME}.`);
    }
    this.toolName = toolName;
  }

  async execute(
    request: DshAcpDomainToolRequest,
    signal?: AbortSignal,
  ): Promise<DshAcpDomainToolResponse> {
    signal?.throwIfAborted();
    if (request.tool !== this.toolName) {
      return failure(
        'DOCUMENT_DSH_TOOL_MISMATCH',
        `Expected ${this.toolName}, received ${request.tool}.`,
      );
    }
    let decoded: DocumentDshToolInput;
    try {
      decoded = decodeDocumentDshToolInput(request.operation, request.input);
    } catch (error) {
      return failure('DOCUMENT_DSH_TOOL_INVALID_INPUT', errorMessage(error));
    }
    try {
      const runtime = typeof this.content === 'function' ? await this.content() : this.content;
      const result = await resolve(runtime, decoded, signal);
      if (result.status !== 'ready') {
        return contentFailure(result);
      }
      return { outcome: 'success', result: toJson(result) };
    } catch (error) {
      return failure(toDocumentDiagnostic(error), errorMessage(error));
    }
  }
}

async function resolve(
  runtime: AgentContentAccessRuntime,
  input: DocumentDshToolInput,
  signal?: AbortSignal,
): Promise<AgentDocumentContentResult> {
  if (input.operation === 'continue') {
    return runtime.resolveDocumentContent({
      source: input.input.source,
      mode: 'next',
      cursor: input.input.cursor,
      ...(signal ? { signal } : {}),
    });
  }
  return runtime.resolveDocumentContent({
    source: input.input.source,
    ...(input.operation === 'read-images'
      ? { includeImages: true, maxImages: input.input.maxImages }
      : {
          mode: input.input.source.selector === undefined ? input.input.mode : 'range',
          includeManifest: input.input.includeManifest,
          includeImages: input.input.includeImages,
          maxChars: input.input.maxChars,
          maxImages: input.input.maxImages,
        }),
    ...(signal ? { signal } : {}),
  });
}

function contentFailure(result: AgentDocumentContentResult): DshAcpDomainToolResponse {
  const diagnostic =
    result.diagnostics.find((candidate) => candidate.severity === 'error') ?? result.diagnostics[0];
  return failure(
    diagnostic?.code ?? 'DOCUMENT_DSH_TOOL_FAILED',
    diagnostic?.message ?? `Document content access ended with status ${result.status}.`,
  );
}

function toJson(value: unknown): DshAcpJsonValue {
  return documentDshJsonValue(value) as DshAcpJsonValue;
}

function toDocumentDiagnostic(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : 'DOCUMENT_DSH_TOOL_FAILED';
  }
  return 'DOCUMENT_DSH_TOOL_FAILED';
}

function failure(code: string, message: string): DshAcpDomainToolResponse {
  return { outcome: 'failure', diagnostic: { code, message } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
