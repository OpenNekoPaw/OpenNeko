import type { CanvasAgentProvenance, CanvasAgentTargetRef } from './canvas-agent-operations';
import {
  getCreativeTableOperationRequirement,
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  type CreativeTableOperationRequirement,
} from './creative-table-profile';
import { isDocumentArchiveResourceRef, type DocumentArchiveResourceRef } from './document-reading';
import { isResourceRef, type ResourceRef } from './resource-cache';
import type { AgentCapabilityApprovalContext } from './agent-capability-lifecycle';
import {
  normalizeCanonicalStoryboardTable,
  validateCanonicalStoryboardTable,
  type StoryboardTable,
} from './storyboard-table';
import { isAgentCapabilityApprovalSource } from './agent-capability-lifecycle';

// Shared because Agent/Webview and Canvas both need the same local capability
// contract; Canvas-owned parsing, binding, and node creation stay in neko-canvas.
export const CANVAS_MARKDOWN_CAPABILITY_IDS = [
  'canvas.ingestMarkdown',
  'canvas.createMarkdownNote',
  'canvas.createTableFromMarkdown',
  'canvas.createStoryboardFromMarkdown',
  'canvas.attachResource',
  'canvas.validateMarkdownStoryboard',
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
  'needs-review',
  'blocked',
] as const;

export type CanvasMarkdownCapabilityStatus = (typeof CANVAS_MARKDOWN_CAPABILITY_STATUSES)[number];

export type CanvasMarkdownCapabilityDiagnosticSeverity = 'info' | 'warning' | 'error';

export const CANVAS_MARKDOWN_INGEST_INTENTS = ['auto', 'note', 'table', 'creative-table'] as const;

export type CanvasMarkdownIngestIntent = (typeof CANVAS_MARKDOWN_INGEST_INTENTS)[number];

export const CANVAS_MARKDOWN_RESOLVED_KINDS = [
  'markdown-note',
  'generic-table',
  'creative-table',
] as const;

export type CanvasMarkdownResolvedKind = (typeof CANVAS_MARKDOWN_RESOLVED_KINDS)[number];

export const CANVAS_CREATIVE_TABLE_FIELD_ROLES = ['approval', 'plan', 'execution'] as const;

export type CanvasCreativeTableFieldRole = (typeof CANVAS_CREATIVE_TABLE_FIELD_ROLES)[number];

export const CANVAS_CREATIVE_TABLE_VALUE_TYPES = [
  'text',
  'number',
  'duration',
  'boolean',
  'enum',
  'resource-token',
  'prompt',
  'action',
  'status',
  'result-ref',
] as const;

export type CanvasCreativeTableValueType = (typeof CANVAS_CREATIVE_TABLE_VALUE_TYPES)[number];

export interface CanvasMarkdownCapabilityResourceCandidate {
  readonly label?: string;
  readonly role?: string;
  readonly token?: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sourceTitle?: string;
  readonly pageNumber?: number;
  readonly resourceRef?: ResourceRef;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
}

export interface CanvasMarkdownCapabilityDiagnostic {
  readonly severity: CanvasMarkdownCapabilityDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly token?: string;
  readonly line?: number;
  readonly column?: number;
  readonly fieldKey?: string;
  readonly resourceIndex?: number;
  readonly candidates?: readonly CanvasMarkdownCapabilityResourceCandidate[];
}

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

export interface CanvasMarkdownCapabilityAction {
  readonly actionId: string;
  readonly label?: string;
  readonly capabilityId?: CanvasMarkdownCapabilityId;
}

export interface CanvasMarkdownConsumedColumn {
  readonly fieldId: string;
  readonly columnId: string;
  readonly label: string;
  readonly role?: CanvasCreativeTableFieldRole;
  readonly valueType?: CanvasCreativeTableValueType;
}

export interface CanvasMarkdownUnknownColumn {
  readonly id: string;
  readonly label: string;
}

export interface CanvasMarkdownCapabilityTableSummary {
  readonly profileId?: string;
  readonly profileAlias?: string;
  readonly displayName?: string;
  readonly reviewKind?: string;
  readonly consumedColumns?: readonly CanvasMarkdownConsumedColumn[];
  readonly unknownColumns?: readonly CanvasMarkdownUnknownColumn[];
}

export interface CanvasMarkdownCapabilityPreviewSummary {
  readonly title?: string;
  readonly tableCount?: number;
  readonly rowCount?: number;
  readonly resourceTokenCount?: number;
  readonly unresolvedResourceTokenCount?: number;
  readonly resolvedKind?: CanvasMarkdownResolvedKind;
  readonly profileId?: string;
  readonly displayFallback?: boolean;
  readonly table?: CanvasMarkdownCapabilityTableSummary;
}

export interface CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: CanvasMarkdownCapabilityId;
  readonly markdown: string;
  readonly title?: string;
  readonly sourceFormat?: CanvasMarkdownSourceFormat;
  readonly resources?: readonly CanvasMarkdownResourceRef[];
  readonly target?: CanvasMarkdownCapabilityTarget;
  readonly provenance?: CanvasAgentProvenance;
  readonly intentHint?: CanvasMarkdownIngestIntent;
  readonly profileHint?: string;
  readonly operationHint?: CreativeTableOperationRequirement['operationId'];
}

export interface CanvasIngestMarkdownInput extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.ingestMarkdown';
}

export interface CanvasCreateMarkdownNoteInput extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.createMarkdownNote';
}

export interface CanvasCreateTableFromMarkdownInput extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.createTableFromMarkdown';
  readonly tableTitle?: string;
}

export interface CanvasCreateStoryboardFromMarkdownInput extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.createStoryboardFromMarkdown';
  /** Preferred production input when Storyboard is already canonical; Markdown remains a source adapter. */
  readonly canonicalStoryboard?: StoryboardTable;
  readonly mode?: 'review-first' | 'create-nodes';
  readonly approval?: AgentCapabilityApprovalContext;
}

export interface CanvasAttachResourceInput {
  readonly capabilityId: 'canvas.attachResource';
  readonly target: CanvasMarkdownCapabilityTarget;
  readonly resource: CanvasMarkdownResourceRef;
  readonly role?: string;
  readonly provenance?: CanvasAgentProvenance;
}

export interface CanvasValidateMarkdownStoryboardInput extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.validateMarkdownStoryboard';
}

export type CanvasMarkdownCapabilityInput =
  | CanvasIngestMarkdownInput
  | CanvasCreateMarkdownNoteInput
  | CanvasCreateTableFromMarkdownInput
  | CanvasCreateStoryboardFromMarkdownInput
  | CanvasAttachResourceInput
  | CanvasValidateMarkdownStoryboardInput;

export interface CanvasMarkdownCapabilityResult {
  readonly capabilityId: CanvasMarkdownCapabilityId;
  readonly status: CanvasMarkdownCapabilityStatus;
  readonly resolvedKind?: CanvasMarkdownResolvedKind;
  readonly profileId?: string;
  readonly displayFallback?: boolean;
  readonly documentUri?: string;
  readonly nodeIds?: readonly string[];
  readonly tableNodeId?: string;
  readonly diagnostics: readonly CanvasMarkdownCapabilityDiagnostic[];
  readonly actions?: readonly CanvasMarkdownCapabilityAction[];
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
  return includesString(CANVAS_MARKDOWN_CAPABILITY_IDS, value);
}

export function isCanvasMarkdownSourceFormat(value: unknown): value is CanvasMarkdownSourceFormat {
  return includesString(CANVAS_MARKDOWN_SOURCE_FORMATS, value);
}

export function isCanvasMarkdownCapabilityStatus(
  value: unknown,
): value is CanvasMarkdownCapabilityStatus {
  return includesString(CANVAS_MARKDOWN_CAPABILITY_STATUSES, value);
}

export function isCanvasMarkdownIngestIntent(value: unknown): value is CanvasMarkdownIngestIntent {
  return includesString(CANVAS_MARKDOWN_INGEST_INTENTS, value);
}

export function isCanvasMarkdownResolvedKind(value: unknown): value is CanvasMarkdownResolvedKind {
  return includesString(CANVAS_MARKDOWN_RESOLVED_KINDS, value);
}

export function isCanvasCreativeTableFieldRole(
  value: unknown,
): value is CanvasCreativeTableFieldRole {
  return includesString(CANVAS_CREATIVE_TABLE_FIELD_ROLES, value);
}

export function isCanvasCreativeTableValueType(
  value: unknown,
): value is CanvasCreativeTableValueType {
  return includesString(CANVAS_CREATIVE_TABLE_VALUE_TYPES, value);
}

export function isCanvasMarkdownResourceRef(value: unknown): value is CanvasMarkdownResourceRef {
  if (!isRecord(value)) return false;
  return (
    optionalString(value['token']) &&
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

export function isCanvasMarkdownCapabilityTarget(
  value: unknown,
): value is CanvasMarkdownCapabilityTarget {
  if (!isRecord(value)) return false;
  return (
    optionalString(value['canvasId']) &&
    optionalString(value['nodeId']) &&
    optionalString(value['containerId']) &&
    optionalString(value['slotId']) &&
    (value['mode'] === undefined || includesString(CANVAS_MARKDOWN_TARGET_MODES, value['mode'])) &&
    (value['fieldPath'] === undefined ||
      (typeof value['fieldPath'] === 'string' &&
        (value['fieldPath'] === '' || value['fieldPath'].startsWith('/')))) &&
    (value['insertionPoint'] === undefined ||
      isCanvasMarkdownInsertionPoint(value['insertionPoint']))
  );
}

export function isCanvasMarkdownCapabilityDiagnostic(
  value: unknown,
): value is CanvasMarkdownCapabilityDiagnostic {
  if (!isRecord(value)) return false;
  return (
    (value['severity'] === 'info' ||
      value['severity'] === 'warning' ||
      value['severity'] === 'error') &&
    typeof value['code'] === 'string' &&
    typeof value['message'] === 'string' &&
    optionalString(value['token']) &&
    optionalNumber(value['line']) &&
    optionalNumber(value['column']) &&
    optionalString(value['fieldKey']) &&
    optionalNumber(value['resourceIndex']) &&
    (value['candidates'] === undefined ||
      (Array.isArray(value['candidates']) &&
        value['candidates'].every(isCanvasMarkdownCapabilityResourceCandidate)))
  );
}

export function isCanvasMarkdownCapabilityAction(
  value: unknown,
): value is CanvasMarkdownCapabilityAction {
  if (!isRecord(value)) return false;
  return (
    typeof value['actionId'] === 'string' &&
    optionalString(value['label']) &&
    (value['capabilityId'] === undefined || isCanvasMarkdownCapabilityId(value['capabilityId']))
  );
}

export function isCanvasMarkdownConsumedColumn(
  value: unknown,
): value is CanvasMarkdownConsumedColumn {
  if (!isRecord(value)) return false;
  return (
    typeof value['fieldId'] === 'string' &&
    typeof value['columnId'] === 'string' &&
    typeof value['label'] === 'string' &&
    (value['role'] === undefined || isCanvasCreativeTableFieldRole(value['role'])) &&
    (value['valueType'] === undefined || isCanvasCreativeTableValueType(value['valueType']))
  );
}

export function isCanvasMarkdownUnknownColumn(
  value: unknown,
): value is CanvasMarkdownUnknownColumn {
  if (!isRecord(value)) return false;
  return typeof value['id'] === 'string' && typeof value['label'] === 'string';
}

export function isCanvasMarkdownCapabilityTableSummary(
  value: unknown,
): value is CanvasMarkdownCapabilityTableSummary {
  if (!isRecord(value)) return false;
  return (
    optionalString(value['profileId']) &&
    optionalString(value['profileAlias']) &&
    optionalString(value['displayName']) &&
    optionalString(value['reviewKind']) &&
    (value['consumedColumns'] === undefined ||
      (Array.isArray(value['consumedColumns']) &&
        value['consumedColumns'].every(isCanvasMarkdownConsumedColumn))) &&
    (value['unknownColumns'] === undefined ||
      (Array.isArray(value['unknownColumns']) &&
        value['unknownColumns'].every(isCanvasMarkdownUnknownColumn)))
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
    (value['resolvedKind'] === undefined || isCanvasMarkdownResolvedKind(value['resolvedKind'])) &&
    optionalString(value['profileId']) &&
    (value['displayFallback'] === undefined || typeof value['displayFallback'] === 'boolean') &&
    optionalString(value['documentUri']) &&
    (value['nodeIds'] === undefined ||
      (Array.isArray(value['nodeIds']) && value['nodeIds'].every(isNonEmptyString))) &&
    optionalString(value['tableNodeId']) &&
    Array.isArray(value['diagnostics']) &&
    value['diagnostics'].every(isCanvasMarkdownCapabilityDiagnostic) &&
    (value['actions'] === undefined ||
      (Array.isArray(value['actions']) &&
        value['actions'].every(isCanvasMarkdownCapabilityAction))) &&
    (value['preview'] === undefined || isCanvasMarkdownCapabilityPreviewSummary(value['preview']))
  );
}

export function validateCanvasMarkdownCapabilityInput(
  value: unknown,
): readonly CanvasMarkdownCapabilityDiagnostic[] {
  if (!isRecord(value)) {
    return [
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-invalid-input',
        'Canvas Markdown capability input must be an object.',
      ),
    ];
  }

  const diagnostics: CanvasMarkdownCapabilityDiagnostic[] = [];
  const capabilityId = value['capabilityId'];
  if (!isCanvasMarkdownCapabilityId(capabilityId)) {
    diagnostics.push(
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-unknown-capability',
        'Canvas Markdown capability id is not supported.',
        'capabilityId',
      ),
    );
    return diagnostics;
  }

  if (capabilityId === 'canvas.attachResource') {
    validateAttachResourceInput(value, diagnostics);
    return diagnostics;
  }

  const canonicalStoryboard = value['canonicalStoryboard'];
  const hasCanonicalStoryboard = canonicalStoryboard !== undefined;
  if (hasCanonicalStoryboard) {
    if (capabilityId !== 'canvas.createStoryboardFromMarkdown') {
      diagnostics.push(
        createCanvasMarkdownDiagnostic(
          'error',
          'canvas-storyboard-canonical-input-unsupported',
          'Canonical Storyboard input is only supported by Canvas storyboard creation.',
          'canonicalStoryboard',
        ),
      );
    } else {
      const normalized = normalizeCanonicalStoryboardTable({ value: canonicalStoryboard });
      if (!normalized.table) {
        diagnostics.push(
          ...normalized.diagnostics.map((diagnostic) =>
            createCanvasMarkdownDiagnostic(
              diagnostic.severity === 'error' ? 'error' : 'warning',
              diagnostic.code,
              diagnostic.message,
              ['canonicalStoryboard', ...diagnostic.path.map(String)].join('.'),
            ),
          ),
        );
      } else {
        for (const diagnostic of validateCanonicalStoryboardTable(normalized.table).diagnostics) {
          if (diagnostic.severity !== 'error') continue;
          diagnostics.push(
            createCanvasMarkdownDiagnostic(
              'error',
              diagnostic.code,
              diagnostic.message,
              ['canonicalStoryboard', ...diagnostic.path.map(String)].join('.'),
            ),
          );
        }
      }
    }
  }

  if (
    !hasCanonicalStoryboard &&
    (typeof value['markdown'] !== 'string' || value['markdown'].trim().length === 0)
  ) {
    diagnostics.push(
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-missing-markdown',
        'Canvas storyboard creation requires canonical Storyboard input or non-empty Markdown.',
        'markdown',
      ),
    );
  }

  if (value['sourceFormat'] !== undefined && !isCanvasMarkdownSourceFormat(value['sourceFormat'])) {
    diagnostics.push(
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-unsupported-source-format',
        'Canvas Markdown source format is not supported.',
        'sourceFormat',
      ),
    );
  }

  if (value['intentHint'] !== undefined && !isCanvasMarkdownIngestIntent(value['intentHint'])) {
    diagnostics.push(
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-unsupported-ingest-intent',
        'Canvas Markdown ingest intent is not supported.',
        'intentHint',
      ),
    );
  }

  validateOperationHint(value['operationHint'], diagnostics);

  if (value['target'] !== undefined && !isCanvasMarkdownCapabilityTarget(value['target'])) {
    diagnostics.push(
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-invalid-target',
        'Canvas Markdown target is invalid.',
        'target',
      ),
    );
  }

  if (value['resources'] !== undefined) {
    if (!Array.isArray(value['resources'])) {
      diagnostics.push(
        createCanvasMarkdownDiagnostic(
          'error',
          'canvas-markdown-invalid-resources',
          'Canvas Markdown resources must be an array.',
          'resources',
        ),
      );
    } else {
      value['resources'].forEach((resource, index) =>
        validateCanvasMarkdownResource(resource, index, diagnostics),
      );
    }
  }

  validateOptionalStringField(value, 'title', diagnostics);
  validateOptionalStringField(value, 'profileHint', diagnostics);
  validateOptionalStringField(value, 'tableTitle', diagnostics);
  if (
    value['mode'] !== undefined &&
    value['mode'] !== 'review-first' &&
    value['mode'] !== 'create-nodes'
  ) {
    diagnostics.push(
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-invalid-mode',
        'Canvas Markdown storyboard creation mode is invalid.',
        'mode',
      ),
    );
  }
  if (value['approval'] !== undefined && !isCanvasMarkdownApprovalContext(value['approval'])) {
    diagnostics.push(
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-invalid-approval',
        'Canvas Markdown approval context is invalid.',
        'approval',
      ),
    );
  }

  return diagnostics;
}

export function createCanvasMarkdownDiagnostic(
  severity: CanvasMarkdownCapabilityDiagnosticSeverity,
  code: string,
  message: string,
  fieldKey?: string,
): CanvasMarkdownCapabilityDiagnostic {
  return {
    severity,
    code,
    message,
    ...(fieldKey ? { fieldKey } : {}),
  };
}

export function isRuntimeOnlyCanvasMarkdownResourceValue(value: string): boolean {
  const normalized = value.trim();
  return RUNTIME_RESOURCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function validateAttachResourceInput(
  value: Readonly<Record<string, unknown>>,
  diagnostics: CanvasMarkdownCapabilityDiagnostic[],
): void {
  if (!isCanvasMarkdownCapabilityTarget(value['target'])) {
    diagnostics.push(
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-invalid-target',
        'Canvas attach resource input must include a valid target.',
        'target',
      ),
    );
  }
  validateCanvasMarkdownResource(value['resource'], undefined, diagnostics, 'resource');
  validateOptionalStringField(value, 'role', diagnostics);
}

function validateOperationHint(
  value: unknown,
  diagnostics: CanvasMarkdownCapabilityDiagnostic[],
): void {
  if (value === undefined) return;
  if (!resolveStoryboardOperationRequirement(value)) {
    diagnostics.push(
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-unsupported-operation-hint',
        'Canvas Markdown operation hint is not supported by the storyboard creative table profile.',
        'operationHint',
      ),
    );
  }
}

function resolveStoryboardOperationRequirement(
  value: unknown,
): CreativeTableOperationRequirement | undefined {
  if (typeof value !== 'string') return undefined;
  for (const candidate of STORYBOARD_CREATIVE_TABLE_PROFILE.operationRequirements) {
    const requirement = getCreativeTableOperationRequirement(
      STORYBOARD_CREATIVE_TABLE_PROFILE,
      candidate.operationId,
    );
    if (requirement?.operationId === value) {
      return requirement;
    }
  }
  return undefined;
}

function validateCanvasMarkdownResource(
  value: unknown,
  resourceIndex: number | undefined,
  diagnostics: CanvasMarkdownCapabilityDiagnostic[],
  fieldKey = 'resources',
): void {
  if (!isRecord(value)) {
    diagnostics.push({
      ...createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-invalid-resource',
        'Canvas Markdown resource must be an object with a stable resource reference.',
        fieldKey,
      ),
      ...(resourceIndex !== undefined ? { resourceIndex } : {}),
    });
    return;
  }

  const token = value['token'];
  const sourcePath = value['sourcePath'];
  validateOptionalStringField(value, 'token', diagnostics, resourceIndex);
  validateOptionalStringField(value, 'label', diagnostics, resourceIndex);
  validateOptionalStringField(value, 'role', diagnostics, resourceIndex);
  validateOptionalStringField(value, 'sourcePath', diagnostics, resourceIndex);

  if (typeof token === 'string' && isRuntimeOnlyCanvasMarkdownResourceValue(token)) {
    diagnostics.push({
      ...createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-runtime-resource-token',
        'Canvas Markdown resource token must not be a runtime-only URI, cache path, or temp path.',
        'token',
      ),
      ...(resourceIndex !== undefined ? { resourceIndex } : {}),
    });
  }

  if (typeof sourcePath === 'string' && isRuntimeOnlyCanvasMarkdownResourceValue(sourcePath)) {
    diagnostics.push({
      ...createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-runtime-resource-path',
        'Canvas Markdown resource path must be a stable workspace-relative or variable path.',
        'sourcePath',
      ),
      ...(resourceIndex !== undefined ? { resourceIndex } : {}),
    });
  }

  const hasResourceRef = isResourceRef(value['resourceRef']);
  const hasDocumentResourceRef = isDocumentArchiveResourceRef(value['documentResourceRef']);
  const hasSourcePath = typeof sourcePath === 'string' && sourcePath.trim().length > 0;

  if (value['resourceRef'] !== undefined && !hasResourceRef) {
    diagnostics.push({
      ...createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-invalid-resource-ref',
        'Canvas Markdown resourceRef is invalid.',
        'resourceRef',
      ),
      ...(resourceIndex !== undefined ? { resourceIndex } : {}),
    });
  }

  if (value['documentResourceRef'] !== undefined && !hasDocumentResourceRef) {
    diagnostics.push({
      ...createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-invalid-document-resource-ref',
        'Canvas Markdown documentResourceRef is invalid.',
        'documentResourceRef',
      ),
      ...(resourceIndex !== undefined ? { resourceIndex } : {}),
    });
  }

  if (!hasResourceRef && !hasDocumentResourceRef && !hasSourcePath) {
    diagnostics.push({
      ...createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-missing-stable-resource',
        'Canvas Markdown resource must include a ResourceRef, DocumentArchiveResourceRef, or stable sourcePath.',
        fieldKey,
      ),
      ...(resourceIndex !== undefined ? { resourceIndex } : {}),
    });
  }
}

function isCanvasMarkdownApprovalContext(value: unknown): value is AgentCapabilityApprovalContext {
  if (!isRecord(value)) return false;
  return (
    isAgentCapabilityApprovalSource(value['source']) &&
    optionalString(value['approvalId']) &&
    optionalNumber(value['approvedAt']) &&
    optionalString(value['approvedBy']) &&
    optionalString(value['creationId']) &&
    optionalString(value['iterationId']) &&
    optionalString(value['profileId']) &&
    optionalString(value['stageId']) &&
    optionalString(value['toolCallId'])
  );
}

function validateOptionalStringField(
  value: Readonly<Record<string, unknown>>,
  fieldKey: string,
  diagnostics: CanvasMarkdownCapabilityDiagnostic[],
  resourceIndex?: number,
): void {
  const fieldValue = value[fieldKey];
  if (fieldValue !== undefined && typeof fieldValue !== 'string') {
    diagnostics.push({
      ...createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-invalid-string-field',
        `Canvas Markdown field "${fieldKey}" must be a string.`,
        fieldKey,
      ),
      ...(resourceIndex !== undefined ? { resourceIndex } : {}),
    });
  }
}

function isCanvasMarkdownInsertionPoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['x'] === 'number' &&
    Number.isFinite(value['x']) &&
    typeof value['y'] === 'number' &&
    Number.isFinite(value['y'])
  );
}

function isCanvasMarkdownCapabilityResourceCandidate(
  value: unknown,
): value is CanvasMarkdownCapabilityResourceCandidate {
  if (!isRecord(value)) return false;
  return (
    optionalString(value['label']) &&
    optionalString(value['role']) &&
    optionalString(value['token']) &&
    optionalString(value['mimeType']) &&
    optionalNumber(value['width']) &&
    optionalNumber(value['height']) &&
    optionalString(value['sourceTitle']) &&
    optionalNumber(value['pageNumber']) &&
    (value['resourceRef'] === undefined || isResourceRef(value['resourceRef'])) &&
    (value['documentResourceRef'] === undefined ||
      isDocumentArchiveResourceRef(value['documentResourceRef']))
  );
}

function isCanvasMarkdownCapabilityPreviewSummary(
  value: unknown,
): value is CanvasMarkdownCapabilityPreviewSummary {
  if (!isRecord(value)) return false;
  return (
    optionalString(value['title']) &&
    optionalNumber(value['tableCount']) &&
    optionalNumber(value['rowCount']) &&
    optionalNumber(value['resourceTokenCount']) &&
    optionalNumber(value['unresolvedResourceTokenCount']) &&
    (value['resolvedKind'] === undefined || isCanvasMarkdownResolvedKind(value['resolvedKind'])) &&
    optionalString(value['profileId']) &&
    (value['displayFallback'] === undefined || typeof value['displayFallback'] === 'boolean') &&
    (value['table'] === undefined || isCanvasMarkdownCapabilityTableSummary(value['table']))
  );
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.some((candidate) => candidate === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}
