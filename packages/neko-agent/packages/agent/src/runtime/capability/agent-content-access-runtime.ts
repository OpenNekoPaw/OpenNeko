import type {
  ContentSourceRef,
  ContentRepresentationLocator,
  ContentLocator,
  ContentStableSourceRef,
  DocumentArchiveResourceRef,
  DocumentBatchCursor,
  DocumentImageInfo,
  DocumentManifest,
  DocumentRange,
  DocumentReadResult,
  ResourceRef,
} from '@neko/shared';

export type AgentContentAccessStatus =
  'ready' | 'missing-source' | 'unsupported-source' | 'unauthorized' | 'failed';

export type AgentContentAccessDiagnosticCode =
  | 'agent-content-access-unavailable'
  | 'resource-cache-unavailable'
  | 'local-resource-projection-unavailable'
  | 'unsupported-source'
  | 'unauthorized'
  | 'non-portable'
  | 'runtime-ref-rejected'
  | 'runtime-handle-rejected'
  | 'projection-failed'
  | 'direct-binary-read-forbidden';

export interface AgentContentAccessDiagnostic {
  readonly code: AgentContentAccessDiagnosticCode | string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentContentAccessBaseInput {
  readonly source: ContentSourceRef;
  readonly signal?: AbortSignal;
  readonly metadata?: Record<string, unknown>;
}

export type AgentImageMetadataInput = AgentContentAccessBaseInput;

export interface AgentDocumentContentInput extends AgentContentAccessBaseInput {
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
  readonly mimeTypeHint?: string;
}

export interface AgentContentAccessOperationResult {
  readonly status: AgentContentAccessStatus;
  readonly source?: ContentStableSourceRef;
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
  readonly mimeType?: string;
  readonly sizeBytes?: number;
}

export interface AgentContentAccessRuntime {
  resolveImageMetadata(input: AgentImageMetadataInput): Promise<AgentImageMetadataResult>;
  resolveDocumentContent(input: AgentDocumentContentInput): Promise<AgentDocumentContentResult>;
  loadRepresentationAsset?(input: {
    readonly locator: ContentRepresentationLocator;
    readonly maxBytes: number;
  }): Promise<AgentProviderAssetResult>;
  loadContentAsset(input: {
    readonly locator: ContentLocator;
    readonly maxBytes: number;
    readonly signal?: AbortSignal;
  }): Promise<AgentProviderAssetResult>;
  loadProviderAsset(input: AgentProviderAssetInput): Promise<AgentProviderAssetResult>;
}

export function createAgentContentAccessDiagnostic(input: {
  readonly code: AgentContentAccessDiagnosticCode | string;
  readonly message: string;
  readonly severity?: AgentContentAccessDiagnostic['severity'];
  readonly metadata?: Record<string, unknown>;
}): AgentContentAccessDiagnostic {
  return {
    code: input.code,
    severity: input.severity ?? 'error',
    message: input.message,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function isAgentContentAccessReady(status: AgentContentAccessStatus): boolean {
  return status === 'ready';
}
