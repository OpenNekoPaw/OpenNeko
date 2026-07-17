import type {
  ContentAccessDiagnostic,
  ContentAccessIntent,
  ContentAccessRequest,
  ContentAccessResult,
  ContentSourceRef,
  ContentAccessStatus,
  ContentAccessTarget,
  ContentStableSourceRef,
  DocumentArchiveResourceRef,
  DocumentBatchCursor,
  DocumentImageInfo,
  DocumentManifest,
  DocumentRange,
  DocumentReadResult,
  ResourceRef,
  ResourceVariantRequest,
} from '@neko/shared';

export type AgentContentAccessCaller =
  | 'read-image'
  | 'read-document'
  | 'perception-asset-loader'
  | 'quality-review'
  | 'attachment-processor'
  | 'media-preprocessor'
  | 'message-resource-projection'
  | 'canvas-transfer'
  | 'storyboard-transfer'
  | 'clipboard-transfer'
  | 'unknown';

export type AgentContentAccessDiagnosticCode =
  | 'agent-content-access-unavailable'
  | 'engine-file-access-unavailable'
  | 'resource-cache-unavailable'
  | 'local-resource-projection-unavailable'
  | 'unsupported-source'
  | 'unauthorized'
  | 'non-portable'
  | 'runtime-ref-rejected'
  | 'runtime-handle-rejected'
  | 'projection-failed'
  | 'direct-binary-read-forbidden';

export interface AgentContentAccessDiagnostic extends ContentAccessDiagnostic {
  readonly code: AgentContentAccessDiagnosticCode | string;
  readonly caller?: AgentContentAccessCaller;
}

export interface AgentContentAccessRuntimeRequest {
  readonly caller: AgentContentAccessCaller;
  readonly request: ContentAccessRequest;
}

export interface AgentContentAccessBaseInput {
  readonly caller?: AgentContentAccessCaller;
  readonly source: ContentSourceRef;
  readonly signal?: AbortSignal;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentImageMetadataInput extends AgentContentAccessBaseInput {
  readonly intent?: Extract<
    ContentAccessIntent,
    'agent-context' | 'interactive-preview' | 'verify'
  >;
  readonly variant?: ResourceVariantRequest;
}

export interface AgentDocumentContentInput extends AgentContentAccessBaseInput {
  readonly intent?: Extract<ContentAccessIntent, 'agent-context' | 'verify'>;
  readonly mode?: 'content' | 'manifest' | 'range' | 'next';
  readonly range?: DocumentRange;
  readonly cursor?: DocumentBatchCursor;
  readonly startBatch?: boolean;
  readonly includeManifest?: boolean;
  readonly includeImages?: boolean;
  readonly maxChars?: number;
  readonly maxImages?: number;
  readonly textOnly?: boolean;
}

export interface AgentProviderAssetInput extends AgentContentAccessBaseInput {
  readonly preferredTarget?: Extract<ContentAccessTarget, 'bytes' | 'local-path' | 'engine-source'>;
  readonly variant?: ResourceVariantRequest;
  readonly mimeTypeHint?: string;
}

export interface AgentResourceProjectionInput extends AgentContentAccessBaseInput {
  readonly target: Extract<ContentAccessTarget, 'webview-uri' | 'runtime-stream' | 'local-path'>;
  readonly variant?: ResourceVariantRequest;
}

export interface AgentContentAccessOperationResult {
  readonly status: ContentAccessStatus;
  readonly source?: ContentStableSourceRef;
  readonly contentAccess?: ContentAccessResult;
  readonly diagnostics: readonly AgentContentAccessDiagnostic[];
  readonly metadata?: Record<string, unknown>;
}

export interface AgentImageMetadataResult extends AgentContentAccessOperationResult {
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes?: number;
  readonly resourceRef?: ResourceRef;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
}

export interface AgentDocumentContentResult extends AgentContentAccessOperationResult {
  readonly text?: string;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly resourceRef?: ResourceRef;
  readonly manifest?: DocumentManifest;
  readonly range?: DocumentRange;
  readonly locator?: DocumentReadResult['locator'];
  readonly excerpt?: DocumentReadResult['excerpt'];
  readonly cursor?: DocumentBatchCursor;
  readonly imageInfo?: readonly DocumentImageInfo[];
  readonly imageCount?: number;
  readonly imagesTruncated?: boolean;
  readonly pageCount?: number;
  readonly totalTextChars?: number;
  readonly returnedTextChars?: number;
  readonly truncated?: boolean;
}

export interface AgentProviderAssetResult extends AgentContentAccessOperationResult {
  readonly bytes?: Uint8Array;
  readonly uri?: string;
  readonly engineSourceToken?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
}

export interface AgentResourceProjectionResult extends AgentContentAccessOperationResult {
  readonly target: ContentAccessTarget;
  readonly uri?: string;
  readonly runtimeOnly: true;
}

export interface AgentContentAccessRuntime {
  resolve(input: AgentContentAccessRuntimeRequest): Promise<ContentAccessResult>;
  resolveImageMetadata(input: AgentImageMetadataInput): Promise<AgentImageMetadataResult>;
  resolveDocumentContent(input: AgentDocumentContentInput): Promise<AgentDocumentContentResult>;
  loadProviderAsset(input: AgentProviderAssetInput): Promise<AgentProviderAssetResult>;
  projectResource(input: AgentResourceProjectionInput): Promise<AgentResourceProjectionResult>;
}

export function createAgentContentAccessDiagnostic(input: {
  readonly code: AgentContentAccessDiagnosticCode | string;
  readonly message: string;
  readonly severity?: AgentContentAccessDiagnostic['severity'];
  readonly caller?: AgentContentAccessCaller;
  readonly request?: ContentAccessRequest;
  readonly metadata?: Record<string, unknown>;
}): AgentContentAccessDiagnostic {
  return {
    code: input.code,
    severity: input.severity ?? 'error',
    message: input.message,
    ...(input.caller ? { caller: input.caller } : {}),
    ...(input.request
      ? {
          intent: input.request.intent,
          target: input.request.target,
          qualityMode: input.request.qualityMode,
        }
      : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function toAgentContentAccessDiagnostics(
  diagnostics: readonly ContentAccessDiagnostic[] | undefined,
  caller?: AgentContentAccessCaller,
): readonly AgentContentAccessDiagnostic[] {
  if (!diagnostics || diagnostics.length === 0) return [];
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    ...(caller && !('caller' in diagnostic) ? { caller } : {}),
  }));
}

export function isAgentContentAccessReady(status: ContentAccessStatus): boolean {
  return status === 'ready';
}

export function createAgentContentAccessFailureResult(input: {
  readonly request: ContentAccessRequest;
  readonly caller: AgentContentAccessCaller;
  readonly code: AgentContentAccessDiagnosticCode | string;
  readonly message: string;
  readonly status?: Exclude<ContentAccessStatus, 'ready'>;
  readonly metadata?: Record<string, unknown>;
}): ContentAccessResult {
  return {
    status: input.status ?? 'failed',
    request: input.request,
    diagnostics: [
      createAgentContentAccessDiagnostic({
        code: input.code,
        message: input.message,
        caller: input.caller,
        request: input.request,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }),
    ],
    error: input.message,
  };
}
