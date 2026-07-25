import type { CanvasAgentProvenance, CanvasAgentTargetRef } from './canvas-agent-operations';
import { isDocumentArchiveResourceRef, type DocumentArchiveResourceRef } from './document-reading';
import { isResourceRef, type ResourceRef } from './resource-cache';

export const CANVAS_MARKDOWN_CAPABILITY_IDS = [
  'canvas.ingestMarkdown',
  'canvas.createMarkdownNote',
] as const;

export type CanvasMarkdownCapabilityId = (typeof CANVAS_MARKDOWN_CAPABILITY_IDS)[number];

export const CANVAS_MARKDOWN_SOURCE_FORMATS = [
  'markdown',
  'markdown-table',
  'gfm-table',
  'resource-reference-markdown',
] as const;

export type CanvasMarkdownSourceFormat = (typeof CANVAS_MARKDOWN_SOURCE_FORMATS)[number];

export const CANVAS_MARKDOWN_CAPABILITY_STATUSES = [
  'created',
  'changed',
  'validated',
  'blocked',
] as const;

export type CanvasMarkdownCapabilityStatus = (typeof CANVAS_MARKDOWN_CAPABILITY_STATUSES)[number];
export type CanvasMarkdownCapabilityDiagnosticSeverity = 'info' | 'warning' | 'error';
export type CanvasMarkdownResolvedKind = 'markdown-note';

export interface CanvasMarkdownCapabilityDiagnostic {
  readonly severity: CanvasMarkdownCapabilityDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly fieldKey?: string;
}

/**
 * Stable resource context that may accompany an Agent handoff. Canvas Markdown
 * capabilities do not turn these references into implicit specialized nodes.
 */
export interface CanvasMarkdownResourceRef {
  readonly token?: string;
  readonly alias?: string;
  readonly label?: string;
  readonly role?: string;
  readonly sourcePath?: string;
  readonly resourceRef?: ResourceRef;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
}

export interface CanvasMarkdownCapabilityTarget extends CanvasAgentTargetRef {
  readonly mode?: 'insert' | 'append' | 'replace' | 'apply' | 'create-child';
}

export interface CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: CanvasMarkdownCapabilityId;
  readonly markdown: string;
  readonly title?: string;
  readonly sourceFormat?: CanvasMarkdownSourceFormat;
  readonly target?: CanvasMarkdownCapabilityTarget;
  readonly provenance?: CanvasAgentProvenance;
}

export interface CanvasIngestMarkdownInput extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.ingestMarkdown';
}

export interface CanvasCreateMarkdownNoteInput extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.createMarkdownNote';
}

export type CanvasMarkdownCapabilityInput =
  CanvasIngestMarkdownInput | CanvasCreateMarkdownNoteInput;

export interface CanvasMarkdownCapabilityPreviewSummary {
  readonly title?: string;
  readonly rowCount?: number;
  readonly resolvedKind?: CanvasMarkdownResolvedKind;
}

export interface CanvasMarkdownCapabilityResult {
  readonly capabilityId: CanvasMarkdownCapabilityId;
  readonly status: CanvasMarkdownCapabilityStatus;
  readonly resolvedKind?: CanvasMarkdownResolvedKind;
  readonly documentUri?: string;
  readonly nodeIds?: readonly string[];
  readonly diagnostics: readonly CanvasMarkdownCapabilityDiagnostic[];
  readonly preview?: CanvasMarkdownCapabilityPreviewSummary;
}

const CANVAS_MARKDOWN_TARGET_MODES = [
  'insert',
  'append',
  'replace',
  'apply',
  'create-child',
] as const;

const RUNTIME_RESOURCE_PATTERNS: readonly RegExp[] = [
  /^vscode-webview:\/\//i,
  /^vscode-webview-resource:\/\//i,
  /^blob:/i,
  /^file:/i,
  /^data:/i,
  /^https?:\/\/127\.0\.0\.1(?::|\/)/i,
  /^https?:\/\/localhost(?::|\/)/i,
  /(?:^|\/)\.neko\/\.cache(?:\/|$)/i,
  /^\/tmp(?:\/|$)/i,
  /^\/var\/folders(?:\/|$)/i,
];

export function isCanvasMarkdownCapabilityId(value: unknown): value is CanvasMarkdownCapabilityId {
  return (
    typeof value === 'string' &&
    (CANVAS_MARKDOWN_CAPABILITY_IDS as readonly string[]).includes(value)
  );
}

export function isCanvasMarkdownCapabilityTarget(
  value: unknown,
): value is CanvasMarkdownCapabilityTarget {
  if (!isRecord(value)) return false;
  return (
    optionalString(value['canvasId']) &&
    optionalString(value['nodeId']) &&
    optionalString(value['containerId']) &&
    optionalString(value['slotId']) &&
    optionalString(value['fieldPath']) &&
    (value['insertionPoint'] === undefined || isCanvasInsertionPoint(value['insertionPoint'])) &&
    (value['mode'] === undefined ||
      (CANVAS_MARKDOWN_TARGET_MODES as readonly unknown[]).includes(value['mode']))
  );
}

export function isCanvasMarkdownResourceRef(value: unknown): value is CanvasMarkdownResourceRef {
  if (!isRecord(value)) return false;
  return (
    optionalString(value['token']) &&
    optionalString(value['alias']) &&
    optionalString(value['label']) &&
    optionalString(value['role']) &&
    optionalString(value['sourcePath']) &&
    (value['resourceRef'] === undefined || isResourceRef(value['resourceRef'])) &&
    (value['documentResourceRef'] === undefined ||
      isDocumentArchiveResourceRef(value['documentResourceRef'])) &&
    (value['sourcePath'] !== undefined ||
      value['resourceRef'] !== undefined ||
      value['documentResourceRef'] !== undefined)
  );
}

export function isCanvasMarkdownCapabilityInput(
  value: unknown,
): value is CanvasMarkdownCapabilityInput {
  return validateCanvasMarkdownCapabilityInput(value).length === 0;
}

export function isCanvasMarkdownCapabilityResult(
  value: unknown,
): value is CanvasMarkdownCapabilityResult {
  if (!isRecord(value)) return false;
  return (
    isCanvasMarkdownCapabilityId(value['capabilityId']) &&
    isCanvasMarkdownCapabilityStatus(value['status']) &&
    (value['resolvedKind'] === undefined || value['resolvedKind'] === 'markdown-note') &&
    optionalString(value['documentUri']) &&
    (value['nodeIds'] === undefined || isStringArray(value['nodeIds'])) &&
    Array.isArray(value['diagnostics']) &&
    value['diagnostics'].every(isCanvasMarkdownCapabilityDiagnostic) &&
    (value['preview'] === undefined || isCanvasMarkdownCapabilityPreview(value['preview']))
  );
}

export function validateCanvasMarkdownCapabilityInput(
  value: unknown,
): readonly CanvasMarkdownCapabilityDiagnostic[] {
  if (!isRecord(value)) {
    return [
      diagnostic(
        'canvas-markdown-invalid-input',
        'Canvas Markdown capability input must be an object.',
      ),
    ];
  }

  const diagnostics: CanvasMarkdownCapabilityDiagnostic[] = [];
  if (!isCanvasMarkdownCapabilityId(value['capabilityId'])) {
    diagnostics.push(
      diagnostic(
        'canvas-markdown-unknown-capability',
        `Unknown Canvas Markdown capability "${String(value['capabilityId'])}".`,
        'capabilityId',
      ),
    );
    return diagnostics;
  }
  if (typeof value['markdown'] !== 'string' || value['markdown'].trim().length === 0) {
    diagnostics.push(
      diagnostic(
        'canvas-markdown-missing-markdown',
        'Canvas Markdown capability requires non-empty Markdown.',
        'markdown',
      ),
    );
  }
  if (!optionalString(value['title'])) {
    diagnostics.push(
      diagnostic(
        'canvas-markdown-invalid-title',
        'Canvas Markdown title must be a string.',
        'title',
      ),
    );
  }
  if (
    value['sourceFormat'] !== undefined &&
    !(
      typeof value['sourceFormat'] === 'string' &&
      (CANVAS_MARKDOWN_SOURCE_FORMATS as readonly string[]).includes(value['sourceFormat'])
    )
  ) {
    diagnostics.push(
      diagnostic(
        'canvas-markdown-unsupported-source-format',
        `Unsupported Canvas Markdown source format "${String(value['sourceFormat'])}".`,
        'sourceFormat',
      ),
    );
  }
  if (value['target'] !== undefined && !isCanvasMarkdownCapabilityTarget(value['target'])) {
    diagnostics.push(
      diagnostic('canvas-markdown-invalid-target', 'Canvas Markdown target is invalid.', 'target'),
    );
  }
  if (value['provenance'] !== undefined && !isCanvasAgentProvenance(value['provenance'])) {
    diagnostics.push(
      diagnostic(
        'canvas-markdown-invalid-provenance',
        'Canvas Markdown provenance is invalid.',
        'provenance',
      ),
    );
  }
  return diagnostics;
}

export function isRuntimeOnlyCanvasMarkdownResourceValue(value: string): boolean {
  return RUNTIME_RESOURCE_PATTERNS.some((pattern) => pattern.test(value));
}

function isCanvasMarkdownCapabilityStatus(value: unknown): value is CanvasMarkdownCapabilityStatus {
  return (
    typeof value === 'string' &&
    (CANVAS_MARKDOWN_CAPABILITY_STATUSES as readonly string[]).includes(value)
  );
}

function isCanvasMarkdownCapabilityDiagnostic(
  value: unknown,
): value is CanvasMarkdownCapabilityDiagnostic {
  if (!isRecord(value)) return false;
  return (
    (value['severity'] === 'info' ||
      value['severity'] === 'warning' ||
      value['severity'] === 'error') &&
    typeof value['code'] === 'string' &&
    typeof value['message'] === 'string' &&
    optionalString(value['fieldKey'])
  );
}

function isCanvasMarkdownCapabilityPreview(
  value: unknown,
): value is CanvasMarkdownCapabilityPreviewSummary {
  if (!isRecord(value)) return false;
  return (
    optionalString(value['title']) &&
    (value['rowCount'] === undefined ||
      (typeof value['rowCount'] === 'number' &&
        Number.isInteger(value['rowCount']) &&
        value['rowCount'] >= 0)) &&
    (value['resolvedKind'] === undefined || value['resolvedKind'] === 'markdown-note')
  );
}

function isCanvasInsertionPoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['x'] === 'number' &&
    Number.isFinite(value['x']) &&
    typeof value['y'] === 'number' &&
    Number.isFinite(value['y'])
  );
}

function isCanvasAgentProvenance(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const source = value['source'];
  return (
    (source === undefined ||
      source === 'agent' ||
      source === 'webview' ||
      source === 'tool' ||
      source === 'user' ||
      source === 'plugin') &&
    optionalString(value['conversationId']) &&
    optionalString(value['messageId']) &&
    optionalString(value['toolCallId']) &&
    optionalString(value['label'])
  );
}

function diagnostic(
  code: string,
  message: string,
  fieldKey?: string,
): CanvasMarkdownCapabilityDiagnostic {
  return {
    severity: 'error',
    code,
    message,
    ...(fieldKey ? { fieldKey } : {}),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
