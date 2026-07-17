import type { DocumentArchiveResourceRef, DocumentSourceRef } from './document-reading';
import type { ResourceRef } from './resource-cache';
import {
  AGENT_PROFILE_SOURCES,
  createAgentProfileDiagnostic,
  toAgentProfileValidationResult,
  validateAgentProfileDescriptorSet,
  validateAgentProfileIdentity,
  type AgentProfileIdentity,
  type AgentProfileDiagnostic,
  type AgentProfileSource,
  type AgentProfileValidationResult,
  type IAgentProfileRegistry,
} from './agent-profile';

export const COMPOSITE_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const COMPOSITE_ARTIFACT_PROTOCOL = 'CompositeArtifact' as const;
export const GENERIC_TABLE_PROTOCOL = 'GenericTable' as const;
export const COMPOSITE_ARTIFACT_KIND = 'composite-artifact' as const;
export const GENERIC_TABLE_KIND = 'generic-table' as const;

export const COMPOSITE_ARTIFACT_BLOCK_KINDS = [
  'text',
  'table',
  'media',
  'gallery',
  'comparison',
  'timeline',
  'domain',
  'diagnostic',
] as const;

export const GENERIC_TABLE_CELL_TYPES = [
  'string',
  'number',
  'boolean',
  'enum',
  'tags',
  'status',
  'diagnostic',
  'resource-ref',
  'media-preview',
  'duration',
  'timecode',
  'json',
  'action',
] as const;

export const ARTIFACT_ACTION_KINDS = ['view', 'review', 'transform', 'execute'] as const;

export const ARTIFACT_ACTION_RISK_LEVELS = ['low', 'medium', 'high', 'destructive'] as const;

export const ARTIFACT_DIAGNOSTIC_SEVERITIES = ['error', 'warning', 'info', 'suggestion'] as const;

export const ARTIFACT_PROFILE_SOURCES = AGENT_PROFILE_SOURCES;

export const ARTIFACT_MEDIA_TYPES = [
  'image',
  'video',
  'audio',
  'model',
  'document',
  'unknown',
] as const;

export type ArtifactJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly ArtifactJsonValue[]
  | { readonly [key: string]: ArtifactJsonValue };

export type ArtifactJsonRecord = {
  readonly [key: string]: ArtifactJsonValue;
};

export type ArtifactExtensionNamespace = `neko.${string}`;

export type ArtifactExtensionMap = Readonly<Record<ArtifactExtensionNamespace, ArtifactJsonValue>>;

export type CompositeArtifactBlockKind = (typeof COMPOSITE_ARTIFACT_BLOCK_KINDS)[number];

export type GenericTableCellType = (typeof GENERIC_TABLE_CELL_TYPES)[number];

export type ArtifactActionKind = (typeof ARTIFACT_ACTION_KINDS)[number];

export type ArtifactActionRiskLevel = (typeof ARTIFACT_ACTION_RISK_LEVELS)[number];

export type ArtifactDiagnosticSeverity = (typeof ARTIFACT_DIAGNOSTIC_SEVERITIES)[number];

export type ArtifactProfileSource = AgentProfileSource;

export type ArtifactMediaType = (typeof ARTIFACT_MEDIA_TYPES)[number];

export type ArtifactPathSegment = string | number;

export type ArtifactDiagnosticCode =
  | 'invalid-root'
  | 'invalid-schema-version'
  | 'invalid-kind'
  | 'invalid-block-kind'
  | 'invalid-cell-type'
  | 'missing-required-field'
  | 'invalid-required-field'
  | 'invalid-extension-namespace'
  | 'non-serializable-value'
  | 'unsafe-runtime-handle'
  | 'invalid-resource-ref'
  | 'invalid-profile'
  | 'unsupported-profile-version'
  | 'missing-profile-descriptor'
  | 'skill-local-profile-persisted'
  | 'profile-field-group-missing'
  | 'profile-field-definition-missing'
  | 'profile-column-mismatch'
  | 'profile-cell-type-mismatch'
  | 'profile-required-cell-missing'
  | 'profile-enum-value-mismatch'
  | 'profile-resource-modality-mismatch'
  | 'profile-schema-ref-mismatch'
  | 'unresolved-schema-ref'
  | 'missing-capability'
  | 'provider-unavailable';

export interface ArtifactDiagnostic {
  readonly severity: ArtifactDiagnosticSeverity;
  readonly code: ArtifactDiagnosticCode;
  readonly path: readonly ArtifactPathSegment[];
  readonly message: string;
  readonly expected?: string;
  readonly actual?: ArtifactJsonValue;
  readonly details?: ArtifactJsonRecord;
}

export interface ArtifactValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly ArtifactDiagnostic[];
}

export interface ArtifactProvenance {
  readonly source: 'agent' | 'skill' | 'tool' | 'user' | 'package';
  readonly skillId?: string;
  readonly skillVersion?: string;
  readonly toolCallId?: string;
  readonly taskId?: string;
  readonly packageId?: string;
  readonly createdAt?: string;
  readonly sourceDocument?: DocumentSourceRef;
  readonly sourceArtifactIds?: readonly string[];
}

export type ArtifactResourceRef =
  | {
      readonly kind: 'resource';
      readonly resource: ResourceRef;
    }
  | {
      readonly kind: 'document-entry';
      readonly resource: DocumentArchiveResourceRef;
    }
  | {
      readonly kind: 'generated-asset';
      readonly assetId: string;
      readonly assetVersion?: string;
      readonly resourceRef?: ResourceRef;
    }
  | {
      readonly kind: 'tool-result';
      readonly toolCallId: string;
      readonly assetIndex?: number;
      readonly taskId?: string;
      readonly resourceRef?: ResourceRef;
    }
  | {
      readonly kind: 'canvas-node';
      readonly canvasNodeId: string;
      readonly outputId?: string;
    }
  | {
      readonly kind: 'story-source';
      readonly storyId: string;
      readonly sceneId?: string;
      readonly frameIndex?: number;
    }
  | {
      readonly kind: 'perception-card';
      readonly assetId: string;
      readonly cardId?: string;
      readonly resourceRef?: ResourceRef;
    };

export interface ArtifactAction {
  readonly actionId: string;
  readonly kind: ArtifactActionKind;
  readonly label?: string;
  readonly description?: string;
  readonly targetPackageId?: string;
  readonly capabilityId?: string;
  readonly projectorId?: string;
  readonly risk?: ArtifactActionRiskLevel;
  readonly requiresApproval?: boolean;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly inputRefs?: readonly string[];
  readonly metadata?: ArtifactJsonRecord;
}

export interface CompositeArtifact {
  readonly schemaVersion: typeof COMPOSITE_ARTIFACT_SCHEMA_VERSION;
  readonly kind: typeof COMPOSITE_ARTIFACT_KIND;
  readonly artifactId: string;
  readonly profile?: string;
  readonly profileVersion?: number;
  readonly title: string;
  readonly blocks: readonly CompositeArtifactBlock[];
  readonly provenance?: ArtifactProvenance;
  readonly diagnostics?: readonly ArtifactDiagnostic[];
  readonly suggestedActions?: readonly ArtifactAction[];
  readonly extensions?: ArtifactExtensionMap;
}

export type CompositeArtifactBlock =
  | CompositeArtifactTextBlock
  | CompositeArtifactTableBlock
  | CompositeArtifactMediaBlock
  | CompositeArtifactGalleryBlock
  | CompositeArtifactComparisonBlock
  | CompositeArtifactTimelineBlock
  | CompositeArtifactDomainBlock
  | CompositeArtifactDiagnosticBlock;

export interface CompositeArtifactBlockBase {
  readonly blockId: string;
  readonly kind: CompositeArtifactBlockKind;
  readonly title?: string;
  readonly role?: string;
  readonly diagnostics?: readonly ArtifactDiagnostic[];
  readonly actions?: readonly ArtifactAction[];
  readonly extensions?: ArtifactExtensionMap;
}

export interface CompositeArtifactTextBlock extends CompositeArtifactBlockBase {
  readonly kind: 'text';
  readonly text: string;
  readonly format?: 'plain' | 'markdown';
}

export interface CompositeArtifactTableBlock extends CompositeArtifactBlockBase {
  readonly kind: 'table';
  readonly table: GenericTable;
}

export interface CompositeArtifactMediaBlock extends CompositeArtifactBlockBase {
  readonly kind: 'media';
  readonly media: ArtifactMediaItem;
}

export interface CompositeArtifactGalleryBlock extends CompositeArtifactBlockBase {
  readonly kind: 'gallery';
  readonly items: readonly ArtifactMediaItem[];
}

export interface ArtifactComparisonCandidate {
  readonly candidateId: string;
  readonly label?: string;
  readonly media?: ArtifactMediaItem;
  readonly score?: number;
  readonly notes?: string;
  readonly metadata?: ArtifactJsonRecord;
}

export interface CompositeArtifactComparisonBlock extends CompositeArtifactBlockBase {
  readonly kind: 'comparison';
  readonly candidates: readonly ArtifactComparisonCandidate[];
}

export interface ArtifactTimelineCue {
  readonly cueId: string;
  readonly startMs: number;
  readonly durationMs?: number;
  readonly label?: string;
  readonly type?: 'shot' | 'dialogue' | 'voice-over' | 'sound' | 'music' | 'effect';
  readonly resourceRef?: ArtifactResourceRef;
  readonly metadata?: ArtifactJsonRecord;
}

export interface CompositeArtifactTimelineBlock extends CompositeArtifactBlockBase {
  readonly kind: 'timeline';
  readonly cues: readonly ArtifactTimelineCue[];
}

export interface CompositeArtifactDomainBlock extends CompositeArtifactBlockBase {
  readonly kind: 'domain';
  readonly domainKind: string;
  readonly schemaVersion?: number;
  readonly payload: ArtifactJsonValue;
}

export interface CompositeArtifactDiagnosticBlock extends CompositeArtifactBlockBase {
  readonly kind: 'diagnostic';
  readonly diagnostics: readonly ArtifactDiagnostic[];
}

export interface ArtifactMediaItem {
  readonly itemId: string;
  readonly mediaType: ArtifactMediaType;
  readonly resourceRef: ArtifactResourceRef;
  readonly label?: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly metadata?: ArtifactJsonRecord;
}

export interface GenericTable {
  readonly schemaVersion: typeof COMPOSITE_ARTIFACT_SCHEMA_VERSION;
  readonly kind: typeof GENERIC_TABLE_KIND;
  readonly tableId: string;
  readonly profile?: string;
  readonly profileVersion?: number;
  readonly title: string;
  readonly columns: readonly GenericTableColumn[];
  readonly rows: readonly GenericTableRow[];
  readonly actions?: readonly ArtifactAction[];
  readonly diagnostics?: readonly ArtifactDiagnostic[];
  readonly extensions?: ArtifactExtensionMap;
}

export interface GenericTableColumn {
  readonly columnId: string;
  readonly label?: string;
  readonly cellType: GenericTableCellType;
  readonly required?: boolean;
  readonly enumValues?: readonly string[];
  readonly schemaRef?: string;
  readonly resourceMediaTypes?: readonly ArtifactMediaType[];
  readonly display?: GenericTableColumnDisplay;
  readonly metadata?: ArtifactJsonRecord;
}

export interface GenericTableColumnDisplay {
  readonly width?: number;
  readonly minWidth?: number;
  readonly align?: 'start' | 'center' | 'end';
  readonly hidden?: boolean;
  readonly sortable?: boolean;
}

export interface GenericTableRow {
  readonly rowId: string;
  readonly cells: Readonly<Record<string, GenericTableCell>>;
  readonly status?: 'draft' | 'needs-review' | 'approved' | 'rejected' | 'blocked';
  readonly diagnostics?: readonly ArtifactDiagnostic[];
  readonly actions?: readonly ArtifactAction[];
  readonly metadata?: ArtifactJsonRecord;
}

export type GenericTableCell =
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'enum'; readonly value: string }
  | { readonly type: 'tags'; readonly value: readonly string[] }
  | { readonly type: 'status'; readonly value: string }
  | { readonly type: 'diagnostic'; readonly value: ArtifactDiagnostic }
  | { readonly type: 'resource-ref'; readonly value: ArtifactResourceRef }
  | { readonly type: 'media-preview'; readonly value: ArtifactMediaItem }
  | { readonly type: 'duration'; readonly valueMs: number }
  | { readonly type: 'timecode'; readonly valueMs: number; readonly format?: string }
  | {
      readonly type: 'json';
      readonly value: ArtifactJsonValue;
      readonly schemaRef?: string;
    }
  | { readonly type: 'action'; readonly value: ArtifactAction };

export interface ArtifactProfileDescriptor extends AgentProfileIdentity<'artifact', number> {
  readonly protocol: typeof COMPOSITE_ARTIFACT_PROTOCOL | typeof GENERIC_TABLE_PROTOCOL | string;
  readonly title?: string;
  readonly blockComposition?: readonly ArtifactProfileBlockRule[];
  readonly fieldDefinitions?: readonly ArtifactProfileFieldDefinition[];
  readonly fieldGroups?: readonly ArtifactProfileFieldGroup[];
  readonly includeFieldGroups?: readonly string[];
  readonly columns?: readonly ArtifactProfileColumnRule[];
  readonly schemaRefs?: readonly ArtifactProfileSchemaRef[];
  readonly resourceConstraints?: readonly ArtifactProfileResourceConstraint[];
  readonly operationRequirements?: readonly ArtifactProfileOperationRequirement[];
  readonly display?: ArtifactProfileDisplayHints;
  readonly validators?: readonly string[];
  readonly suggestedActions?: readonly ArtifactAction[];
  readonly mappings?: readonly ArtifactProfileMapping[];
  readonly extensions?: ArtifactExtensionMap;
}

export type IArtifactProfileRegistry = IAgentProfileRegistry<ArtifactProfileDescriptor>;

export interface ArtifactProfileBlockRule {
  readonly kind: CompositeArtifactBlockKind;
  readonly required?: boolean;
  readonly minCount?: number;
  readonly maxCount?: number;
  readonly role?: string;
}

export interface ArtifactProfileFieldDefinition extends ArtifactProfileColumnRule {
  readonly description?: string;
}

export interface ArtifactProfileFieldGroup {
  readonly groupId: string;
  readonly label?: string;
  readonly fieldIds: readonly string[];
}

export interface ArtifactProfileColumnRule {
  readonly columnId: string;
  readonly label?: string;
  readonly cellType: GenericTableCellType;
  readonly required?: boolean;
  readonly enumValues?: readonly string[];
  readonly schemaRef?: string;
  readonly resourceMediaTypes?: readonly ArtifactMediaType[];
  readonly shape?: ArtifactJsonShapeRule;
}

export interface ArtifactProfileSchemaRef {
  readonly schemaId: string;
  readonly version?: string | number;
  readonly required?: boolean;
}

export interface ArtifactProfileResourceConstraint {
  readonly constraintId: string;
  readonly mediaTypes?: readonly ArtifactMediaType[];
  readonly required?: boolean;
  readonly appliesToColumnIds?: readonly string[];
  readonly appliesToBlockRoles?: readonly string[];
}

export interface ArtifactProfileOperationRequirement {
  readonly operationId: string;
  readonly capabilityId?: string;
  readonly validatorId?: string;
  readonly required?: boolean;
  readonly risk?: ArtifactActionRiskLevel;
}

export interface ArtifactJsonShapeRule {
  readonly requiredKeys?: readonly string[];
  readonly fieldTypes?: Readonly<
    Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'>
  >;
  readonly maxArrayLengths?: Readonly<Record<string, number>>;
}

export interface ArtifactProfileDisplayHints {
  readonly defaultSortColumnId?: string;
  readonly defaultGroupColumnId?: string;
  readonly compact?: boolean;
}

export interface ArtifactProfileMapping {
  readonly mappingId: string;
  readonly targetKind: string;
  readonly fieldMap?: Readonly<Record<string, string>>;
  readonly projectorId?: string;
}

export interface ArtifactValidationOptions {
  readonly profiles?: readonly ArtifactProfileDescriptor[];
  readonly requireProfileVersionForPersisted?: boolean;
  readonly persisted?: boolean;
  readonly maxJsonCellBytes?: number;
  readonly maxDiagnostics?: number;
  readonly resolvedSchemaRefs?: readonly string[];
}

export interface ArtifactExecutionSummary {
  readonly summaryId: string;
  readonly artifactId: string;
  readonly actionId: string;
  readonly providerId?: string;
  readonly status: 'succeeded' | 'failed' | 'partial' | 'unavailable' | 'cancelled';
  readonly createdRefs?: readonly ArtifactResourceRef[];
  readonly updatedRefs?: readonly ArtifactResourceRef[];
  readonly diagnostics?: readonly ArtifactDiagnostic[];
  readonly metadata?: ArtifactJsonRecord;
}

export function validateArtifactProfileDescriptor(
  descriptor: unknown,
): AgentProfileValidationResult {
  const diagnostics = [
    ...validateAgentProfileIdentity(descriptor, { expectedKind: 'artifact' }).diagnostics,
  ];

  if (!isRecord(descriptor)) {
    return toAgentProfileValidationResult(diagnostics);
  }

  if (typeof descriptor['protocol'] !== 'string' || descriptor['protocol'].trim().length === 0) {
    diagnostics.push(
      createAgentProfileDiagnostic({
        severity: 'error',
        code: 'malformed-profile-descriptor',
        path: ['protocol'],
        profileId: readProfileIdFromDescriptor(descriptor),
        kind: 'artifact',
        message: 'Artifact profile descriptor must declare protocol.',
      }),
    );
  }

  validateArtifactProfileColumnRules(descriptor['columns'], ['columns'], descriptor, diagnostics);
  validateArtifactProfileColumnRules(
    descriptor['fieldDefinitions'],
    ['fieldDefinitions'],
    descriptor,
    diagnostics,
  );
  validateStringArrayDescriptorField(
    descriptor['validators'],
    ['validators'],
    descriptor,
    diagnostics,
  );
  validateArtifactProfileSchemaRefs(descriptor['schemaRefs'], descriptor, diagnostics);

  return toAgentProfileValidationResult(diagnostics);
}

export function validateArtifactProfileDescriptorSet(
  descriptors: readonly ArtifactProfileDescriptor[],
): AgentProfileValidationResult {
  const diagnostics = [
    ...validateAgentProfileDescriptorSet(descriptors, { expectedKind: 'artifact' }).diagnostics,
  ];
  for (const [index, descriptor] of descriptors.entries()) {
    diagnostics.push(
      ...validateArtifactProfileDescriptor(descriptor).diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['profiles', index, ...(diagnostic.path ?? [])],
      })),
    );
  }
  return toAgentProfileValidationResult(diagnostics);
}

export function validateCompositeArtifact(
  value: unknown,
  options: ArtifactValidationOptions = {},
): ArtifactValidationResult {
  const diagnostics: ArtifactDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostics: [
        artifactDiagnostic('error', 'invalid-root', [], 'Composite artifact must be an object.'),
      ],
    };
  }

  validateSchemaVersion(value['schemaVersion'], [], diagnostics);
  validateLiteralKind(value['kind'], COMPOSITE_ARTIFACT_KIND, ['kind'], diagnostics);
  requireString(value['artifactId'], ['artifactId'], diagnostics);
  requireString(value['title'], ['title'], diagnostics);
  validateOptionalProfileVersion(value, diagnostics, options);
  validateExtensions(value['extensions'], ['extensions'], diagnostics);
  validateDiagnosticsArray(value['diagnostics'], ['diagnostics'], diagnostics);
  validateActionsArray(value['suggestedActions'], ['suggestedActions'], diagnostics);

  if (!Array.isArray(value['blocks'])) {
    diagnostics.push(missingRequiredDiagnostic(['blocks'], 'blocks'));
  } else {
    value['blocks'].forEach((block, index) =>
      validateCompositeArtifactBlock(block, ['blocks', index], diagnostics, options),
    );
  }

  validateProfileForCompositeArtifact(value, diagnostics, options);
  return artifactValidationResult(diagnostics, options);
}

export function validateGenericTable(
  value: unknown,
  options: ArtifactValidationOptions = {},
): ArtifactValidationResult {
  const diagnostics: ArtifactDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostics: [
        artifactDiagnostic('error', 'invalid-root', [], 'Generic table must be an object.'),
      ],
    };
  }

  validateSchemaVersion(value['schemaVersion'], [], diagnostics);
  validateLiteralKind(value['kind'], GENERIC_TABLE_KIND, ['kind'], diagnostics);
  requireString(value['tableId'], ['tableId'], diagnostics);
  requireString(value['title'], ['title'], diagnostics);
  validateOptionalProfileVersion(value, diagnostics, options);
  validateExtensions(value['extensions'], ['extensions'], diagnostics);
  validateDiagnosticsArray(value['diagnostics'], ['diagnostics'], diagnostics);
  validateActionsArray(value['actions'], ['actions'], diagnostics);

  if (!Array.isArray(value['columns'])) {
    diagnostics.push(missingRequiredDiagnostic(['columns'], 'columns'));
  } else {
    value['columns'].forEach((column, index) =>
      validateGenericTableColumn(column, ['columns', index], diagnostics),
    );
  }

  if (!Array.isArray(value['rows'])) {
    diagnostics.push(missingRequiredDiagnostic(['rows'], 'rows'));
  } else {
    value['rows'].forEach((row, index) =>
      validateGenericTableRow(row, ['rows', index], diagnostics, options),
    );
  }

  validateProfileForGenericTable(value, diagnostics, options);
  return artifactValidationResult(diagnostics, options);
}

function validateArtifactProfileColumnRules(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  descriptor: Record<string, unknown>,
  diagnostics: AgentProfileDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      createAgentProfileDiagnostic({
        severity: 'error',
        code: 'malformed-profile-descriptor',
        path,
        profileId: readProfileIdFromDescriptor(descriptor),
        kind: 'artifact',
        message: 'Artifact profile column rules must be an array.',
      }),
    );
    return;
  }

  value.forEach((rule, index) => {
    if (!isRecord(rule)) {
      diagnostics.push(
        createAgentProfileDiagnostic({
          severity: 'error',
          code: 'malformed-profile-descriptor',
          path: [...path, index],
          profileId: readProfileIdFromDescriptor(descriptor),
          kind: 'artifact',
          message: 'Artifact profile column rule must be an object.',
        }),
      );
      return;
    }
    if (typeof rule['columnId'] !== 'string' || rule['columnId'].trim().length === 0) {
      diagnostics.push(
        createAgentProfileDiagnostic({
          severity: 'error',
          code: 'malformed-profile-descriptor',
          path: [...path, index, 'columnId'],
          profileId: readProfileIdFromDescriptor(descriptor),
          kind: 'artifact',
          message: 'Artifact profile column rule must declare columnId.',
        }),
      );
    }
    if (!isGenericTableCellType(rule['cellType'])) {
      diagnostics.push(
        createAgentProfileDiagnostic({
          severity: 'error',
          code: 'malformed-profile-descriptor',
          path: [...path, index, 'cellType'],
          profileId: readProfileIdFromDescriptor(descriptor),
          kind: 'artifact',
          message: 'Artifact profile column rule must declare a supported cellType.',
          expected: GENERIC_TABLE_CELL_TYPES.join(', '),
          actual: rule['cellType'],
        }),
      );
    }
  });
}

function validateStringArrayDescriptorField(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  descriptor: Record<string, unknown>,
  diagnostics: AgentProfileDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      createAgentProfileDiagnostic({
        severity: 'error',
        code: 'malformed-profile-descriptor',
        path,
        profileId: readProfileIdFromDescriptor(descriptor),
        kind: 'artifact',
        message: 'Artifact profile descriptor field must be an array of strings.',
      }),
    );
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      diagnostics.push(
        createAgentProfileDiagnostic({
          severity: 'error',
          code: 'malformed-profile-descriptor',
          path: [...path, index],
          profileId: readProfileIdFromDescriptor(descriptor),
          kind: 'artifact',
          message: 'Artifact profile descriptor field entry must be a non-empty string.',
          actual: entry,
        }),
      );
    }
  });
}

function validateArtifactProfileSchemaRefs(
  value: unknown,
  descriptor: Record<string, unknown>,
  diagnostics: AgentProfileDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      createAgentProfileDiagnostic({
        severity: 'error',
        code: 'malformed-profile-descriptor',
        path: ['schemaRefs'],
        profileId: readProfileIdFromDescriptor(descriptor),
        kind: 'artifact',
        message: 'Artifact profile schemaRefs must be an array.',
      }),
    );
    return;
  }
  value.forEach((schemaRef, index) => {
    if (
      !isRecord(schemaRef) ||
      typeof schemaRef['schemaId'] !== 'string' ||
      schemaRef['schemaId'].trim().length === 0
    ) {
      diagnostics.push(
        createAgentProfileDiagnostic({
          severity: 'error',
          code: 'malformed-profile-descriptor',
          path: ['schemaRefs', index, 'schemaId'],
          profileId: readProfileIdFromDescriptor(descriptor),
          kind: 'artifact',
          message: 'Artifact profile schemaRef must declare schemaId.',
        }),
      );
    }
  });
}

function readProfileIdFromDescriptor(descriptor: Record<string, unknown>): string | undefined {
  return typeof descriptor['profileId'] === 'string' ? descriptor['profileId'] : undefined;
}

function validateCompositeArtifactBlock(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'invalid-required-field',
        path,
        'Artifact block must be an object.',
      ),
    );
    return;
  }
  requireString(value['blockId'], [...path, 'blockId'], diagnostics);
  const kind = value['kind'];
  if (!isCompositeArtifactBlockKind(kind)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'invalid-block-kind',
        [...path, 'kind'],
        'Unsupported artifact block kind.',
        {
          expected: COMPOSITE_ARTIFACT_BLOCK_KINDS.join(', '),
          actual: serializableDiagnosticValue(kind),
        },
      ),
    );
    return;
  }

  validateExtensions(value['extensions'], [...path, 'extensions'], diagnostics);
  validateDiagnosticsArray(value['diagnostics'], [...path, 'diagnostics'], diagnostics);
  validateActionsArray(value['actions'], [...path, 'actions'], diagnostics);

  switch (kind) {
    case 'text':
      requireString(value['text'], [...path, 'text'], diagnostics);
      break;
    case 'table':
      diagnostics.push(
        ...validateGenericTable(value['table'], options).diagnostics.map((diagnostic) => ({
          ...diagnostic,
          path: [...path, 'table', ...diagnostic.path],
        })),
      );
      break;
    case 'media':
      validateMediaItem(value['media'], [...path, 'media'], diagnostics, options);
      break;
    case 'gallery':
      validateArray(value['items'], [...path, 'items'], diagnostics, (item, itemPath) =>
        validateMediaItem(item, itemPath, diagnostics, options),
      );
      break;
    case 'comparison':
      validateArray(
        value['candidates'],
        [...path, 'candidates'],
        diagnostics,
        (candidate, candidatePath) =>
          validateComparisonCandidate(candidate, candidatePath, diagnostics, options),
      );
      break;
    case 'timeline':
      validateArray(value['cues'], [...path, 'cues'], diagnostics, (cue, cuePath) =>
        validateTimelineCue(cue, cuePath, diagnostics, options),
      );
      break;
    case 'domain':
      requireString(value['domainKind'], [...path, 'domainKind'], diagnostics);
      validateSerializableValue(value['payload'], [...path, 'payload'], diagnostics);
      break;
    case 'diagnostic':
      if (!Array.isArray(value['diagnostics'])) {
        diagnostics.push(missingRequiredDiagnostic([...path, 'diagnostics'], 'diagnostics'));
      }
      break;
  }
}

function validateGenericTableColumn(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'invalid-required-field',
        path,
        'Generic table column must be an object.',
      ),
    );
    return;
  }
  requireString(value['columnId'], [...path, 'columnId'], diagnostics);
  if (!isGenericTableCellType(value['cellType'])) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'invalid-cell-type',
        [...path, 'cellType'],
        'Unsupported generic table cell type.',
        {
          expected: GENERIC_TABLE_CELL_TYPES.join(', '),
          actual: serializableDiagnosticValue(value['cellType']),
        },
      ),
    );
  }
  if (value['enumValues'] !== undefined) {
    validateStringArray(value['enumValues'], [...path, 'enumValues'], diagnostics);
  }
  if (value['schemaRef'] !== undefined) {
    requireString(value['schemaRef'], [...path, 'schemaRef'], diagnostics);
  }
  validateResourceMediaTypes(
    value['resourceMediaTypes'],
    [...path, 'resourceMediaTypes'],
    diagnostics,
  );
  validateSerializableValue(value['display'], [...path, 'display'], diagnostics);
  validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
}

function validateGenericTableRow(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'invalid-required-field',
        path,
        'Generic table row must be an object.',
      ),
    );
    return;
  }
  requireString(value['rowId'], [...path, 'rowId'], diagnostics);
  if (!isRecord(value['cells'])) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'cells'], 'cells'));
    return;
  }
  for (const [columnId, cell] of Object.entries(value['cells'])) {
    validateGenericTableCell(cell, [...path, 'cells', columnId], diagnostics, options);
  }
  validateDiagnosticsArray(value['diagnostics'], [...path, 'diagnostics'], diagnostics);
  validateActionsArray(value['actions'], [...path, 'actions'], diagnostics);
  validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
}

function validateGenericTableCell(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'invalid-required-field',
        path,
        'Generic table cell must be an object.',
      ),
    );
    return;
  }
  const type = value['type'];
  if (!isGenericTableCellType(type)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'invalid-cell-type',
        [...path, 'type'],
        'Unsupported generic table cell type.',
        {
          expected: GENERIC_TABLE_CELL_TYPES.join(', '),
          actual: serializableDiagnosticValue(type),
        },
      ),
    );
    return;
  }

  switch (type) {
    case 'string':
    case 'enum':
    case 'status':
      requireString(value['value'], [...path, 'value'], diagnostics);
      break;
    case 'number':
      requireFiniteNumber(value['value'], [...path, 'value'], diagnostics);
      break;
    case 'boolean':
      if (typeof value['value'] !== 'boolean') {
        diagnostics.push(invalidFieldDiagnostic([...path, 'value'], 'boolean', value['value']));
      }
      break;
    case 'tags':
      validateStringArray(value['value'], [...path, 'value'], diagnostics);
      break;
    case 'diagnostic':
      validateDiagnostic(value['value'], [...path, 'value'], diagnostics);
      break;
    case 'resource-ref':
      validateArtifactResourceRef(value['value'], [...path, 'value'], diagnostics);
      break;
    case 'media-preview':
      validateMediaItem(value['value'], [...path, 'value'], diagnostics, options);
      break;
    case 'duration':
    case 'timecode':
      requireFiniteNumber(value['valueMs'], [...path, 'valueMs'], diagnostics);
      break;
    case 'json':
      validateJsonCellValue(value, path, diagnostics, options);
      break;
    case 'action':
      validateAction(value['value'], [...path, 'value'], diagnostics);
      break;
  }
}

function validateJsonCellValue(
  cell: Record<string, unknown>,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  validateSerializableValue(cell['value'], [...path, 'value'], diagnostics);
  const byteLength = jsonByteLength(cell['value']);
  const maxBytes = options.maxJsonCellBytes ?? 16_384;
  if (byteLength > maxBytes) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'non-serializable-value',
        [...path, 'value'],
        'JSON cell exceeds maximum serialized size.',
        {
          expected: `<= ${maxBytes} bytes`,
          actual: byteLength,
        },
      ),
    );
  }
  if (cell['schemaRef'] !== undefined) {
    if (typeof cell['schemaRef'] !== 'string' || cell['schemaRef'].trim().length === 0) {
      diagnostics.push(
        invalidFieldDiagnostic([...path, 'schemaRef'], 'non-empty string', cell['schemaRef']),
      );
    } else if (
      options.resolvedSchemaRefs &&
      !options.resolvedSchemaRefs.includes(cell['schemaRef'])
    ) {
      diagnostics.push(
        artifactDiagnostic(
          'error',
          'unresolved-schema-ref',
          [...path, 'schemaRef'],
          'JSON cell schemaRef is not resolved.',
          {
            actual: cell['schemaRef'],
          },
        ),
      );
    }
  }
}

function validateProfileForCompositeArtifact(
  artifact: Record<string, unknown>,
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  const profile = readOptionalString(artifact['profile']);
  if (!profile) return;
  const descriptor = findProfileDescriptor(
    profile,
    artifact['profileVersion'],
    options,
    diagnostics,
  );
  if (!descriptor) {
    return;
  }
  if (descriptor.protocol !== COMPOSITE_ARTIFACT_PROTOCOL) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'invalid-profile',
        ['profile'],
        'Profile descriptor protocol does not match artifact kind.',
        {
          expected: COMPOSITE_ARTIFACT_PROTOCOL,
          actual: String(descriptor.protocol),
        },
      ),
    );
  }
  if (descriptor.blockComposition && Array.isArray(artifact['blocks'])) {
    for (const rule of descriptor.blockComposition) {
      if (!rule.required) continue;
      const count = artifact['blocks'].filter(
        (block) =>
          isRecord(block) &&
          block['kind'] === rule.kind &&
          (rule.role === undefined || block['role'] === rule.role),
      ).length;
      if (count === 0 || (rule.minCount !== undefined && count < rule.minCount)) {
        diagnostics.push(
          artifactDiagnostic(
            'error',
            'profile-required-cell-missing',
            ['blocks'],
            `Profile requires ${rule.kind} block.`,
            {
              expected: rule.kind,
            },
          ),
        );
      }
    }
  }
  validateActionsAllowedByProfile(
    descriptor,
    artifact['suggestedActions'],
    ['suggestedActions'],
    diagnostics,
  );
}

function validateProfileForGenericTable(
  table: Record<string, unknown>,
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  const profile = readOptionalString(table['profile']);
  if (!profile) return;
  const descriptor = findProfileDescriptor(profile, table['profileVersion'], options, diagnostics);
  if (!descriptor) {
    return;
  }
  if (descriptor.protocol !== GENERIC_TABLE_PROTOCOL) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'invalid-profile',
        ['profile'],
        'Profile descriptor protocol does not match table kind.',
        {
          expected: GENERIC_TABLE_PROTOCOL,
          actual: String(descriptor.protocol),
        },
      ),
    );
  }
  const profileColumns = resolveProfileColumnRules(descriptor, diagnostics);
  if (
    profileColumns.length === 0 ||
    !Array.isArray(table['columns']) ||
    !Array.isArray(table['rows'])
  ) {
    return;
  }

  const columnsById = new Map<string, Record<string, unknown>>();
  for (const column of table['columns']) {
    if (isRecord(column) && typeof column['columnId'] === 'string') {
      columnsById.set(column['columnId'], column);
    }
  }
  for (const rule of profileColumns) {
    const column = columnsById.get(rule.columnId);
    if (!column) {
      if (rule.required) {
        diagnostics.push(
          artifactDiagnostic(
            'error',
            'profile-column-mismatch',
            ['columns'],
            `Profile requires column ${rule.columnId}.`,
            {
              expected: rule.columnId,
            },
          ),
        );
      }
      continue;
    }
    if (column['cellType'] !== rule.cellType) {
      diagnostics.push(
        artifactDiagnostic(
          'error',
          'profile-cell-type-mismatch',
          ['columns', rule.columnId, 'cellType'],
          `Column ${rule.columnId} has wrong cell type.`,
          {
            expected: rule.cellType,
            actual: serializableDiagnosticValue(column['cellType']),
          },
        ),
      );
    }
    validateProfileColumnMetadata(rule, column, diagnostics, options);
  }

  validateActionsAllowedByProfile(descriptor, table['actions'], ['actions'], diagnostics);

  table['rows'].forEach((row, rowIndex) => {
    if (!isRecord(row) || !isRecord(row['cells'])) return;
    validateActionsAllowedByProfile(
      descriptor,
      row['actions'],
      ['rows', rowIndex, 'actions'],
      diagnostics,
    );
    for (const rule of profileColumns) {
      const column = columnsById.get(rule.columnId);
      const cell = row['cells'][rule.columnId];
      if (cell === undefined) {
        if (rule.required) {
          diagnostics.push(
            artifactDiagnostic(
              'error',
              'profile-required-cell-missing',
              ['rows', rowIndex, 'cells', rule.columnId],
              `Profile requires cell ${rule.columnId}.`,
              {
                expected: rule.columnId,
              },
            ),
          );
        }
        continue;
      }
      if (isRecord(cell) && cell['type'] !== rule.cellType) {
        diagnostics.push(
          artifactDiagnostic(
            'error',
            'profile-cell-type-mismatch',
            ['rows', rowIndex, 'cells', rule.columnId, 'type'],
            `Cell ${rule.columnId} has wrong type.`,
            {
              expected: rule.cellType,
              actual: serializableDiagnosticValue(cell['type']),
            },
          ),
        );
      }
      validateProfileCellMetadata(
        rule,
        column,
        cell,
        ['rows', rowIndex, 'cells', rule.columnId],
        diagnostics,
        options,
      );
      if (rule.shape && isRecord(cell) && cell['type'] === 'json') {
        validateJsonShape(
          cell['value'],
          rule.shape,
          ['rows', rowIndex, 'cells', rule.columnId, 'value'],
          diagnostics,
        );
      }
    }
  });
}

function validateProfileColumnMetadata(
  rule: ArtifactProfileColumnRule,
  column: Record<string, unknown>,
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  if (
    rule.schemaRef !== undefined &&
    column['schemaRef'] !== undefined &&
    column['schemaRef'] !== rule.schemaRef
  ) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'profile-schema-ref-mismatch',
        ['columns', rule.columnId, 'schemaRef'],
        `Column ${rule.columnId} has wrong schemaRef.`,
        {
          expected: rule.schemaRef,
          actual: serializableDiagnosticValue(column['schemaRef']),
        },
      ),
    );
  }
  if (rule.schemaRef !== undefined) {
    validateResolvedSchemaRef(
      rule.schemaRef,
      ['columns', rule.columnId, 'schemaRef'],
      diagnostics,
      options,
    );
  }
  if (rule.resourceMediaTypes && column['resourceMediaTypes'] !== undefined) {
    const columnMediaTypes = Array.isArray(column['resourceMediaTypes'])
      ? column['resourceMediaTypes']
      : [];
    const missing = rule.resourceMediaTypes.filter(
      (mediaType) => !columnMediaTypes.includes(mediaType),
    );
    if (missing.length > 0) {
      diagnostics.push(
        artifactDiagnostic(
          'error',
          'profile-resource-modality-mismatch',
          ['columns', rule.columnId, 'resourceMediaTypes'],
          `Column ${rule.columnId} does not allow all profile media types.`,
          {
            expected: rule.resourceMediaTypes.join(', '),
            actual: serializableDiagnosticValue(column['resourceMediaTypes']),
          },
        ),
      );
    }
  }
}

function validateProfileCellMetadata(
  rule: ArtifactProfileColumnRule,
  column: Record<string, unknown> | undefined,
  cell: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  if (!isRecord(cell)) return;
  if (rule.enumValues && isCellWithStringValue(cell) && !rule.enumValues.includes(cell.value)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'profile-enum-value-mismatch',
        [...path, 'value'],
        `Cell ${rule.columnId} has a value outside the profile enum.`,
        {
          expected: rule.enumValues.join(', '),
          actual: cell.value,
        },
      ),
    );
  }

  const mediaType = readProfileCellMediaType(cell);
  if (rule.resourceMediaTypes && mediaType && !rule.resourceMediaTypes.includes(mediaType)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'profile-resource-modality-mismatch',
        [...path, 'value', 'mediaType'],
        `Cell ${rule.columnId} has a media type outside the profile allowance.`,
        {
          expected: rule.resourceMediaTypes.join(', '),
          actual: mediaType,
        },
      ),
    );
  }

  if (rule.schemaRef !== undefined && cell['type'] === 'json') {
    const columnSchemaRef = readOptionalString(column?.['schemaRef']);
    const cellSchemaRef = readOptionalString(cell['schemaRef']);
    const effectiveSchemaRef = cellSchemaRef ?? columnSchemaRef;
    if (effectiveSchemaRef === undefined) {
      diagnostics.push(
        artifactDiagnostic(
          'error',
          'profile-schema-ref-mismatch',
          [...path, 'schemaRef'],
          `Cell ${rule.columnId} is missing profile schemaRef.`,
          {
            expected: rule.schemaRef,
          },
        ),
      );
    } else if (effectiveSchemaRef !== rule.schemaRef) {
      diagnostics.push(
        artifactDiagnostic(
          'error',
          'profile-schema-ref-mismatch',
          [...path, 'schemaRef'],
          `Cell ${rule.columnId} has wrong schemaRef.`,
          {
            expected: rule.schemaRef,
            actual: effectiveSchemaRef,
          },
        ),
      );
    }
    validateResolvedSchemaRef(rule.schemaRef, [...path, 'schemaRef'], diagnostics, options);
  }
}

function resolveProfileColumnRules(
  descriptor: ArtifactProfileDescriptor,
  diagnostics: ArtifactDiagnostic[],
): readonly ArtifactProfileColumnRule[] {
  const rules = new Map<string, ArtifactProfileColumnRule>();
  const fieldDefinitions = new Map<string, ArtifactProfileFieldDefinition>();
  const fieldGroups = new Map<string, ArtifactProfileFieldGroup>();

  for (const fieldDefinition of descriptor.fieldDefinitions ?? []) {
    fieldDefinitions.set(fieldDefinition.columnId, fieldDefinition);
  }
  for (const fieldGroup of descriptor.fieldGroups ?? []) {
    fieldGroups.set(fieldGroup.groupId, fieldGroup);
  }

  for (const [groupIndex, groupId] of (descriptor.includeFieldGroups ?? []).entries()) {
    const group = fieldGroups.get(groupId);
    if (!group) {
      diagnostics.push(
        artifactDiagnostic(
          'error',
          'profile-field-group-missing',
          ['profile', 'includeFieldGroups', groupIndex],
          `Profile references unknown field group ${groupId}.`,
          { actual: groupId },
        ),
      );
      continue;
    }
    for (const [fieldIndex, fieldId] of group.fieldIds.entries()) {
      const fieldDefinition = fieldDefinitions.get(fieldId);
      if (!fieldDefinition) {
        diagnostics.push(
          artifactDiagnostic(
            'error',
            'profile-field-definition-missing',
            ['profile', 'fieldGroups', group.groupId, 'fieldIds', fieldIndex],
            `Profile field group ${group.groupId} references unknown field ${fieldId}.`,
            {
              expected: fieldId,
              actual: group.groupId,
            },
          ),
        );
        continue;
      }
      rules.set(fieldDefinition.columnId, fieldDefinition);
    }
  }

  for (const rule of descriptor.columns ?? []) {
    rules.set(rule.columnId, { ...rules.get(rule.columnId), ...rule });
  }

  return Array.from(rules.values());
}

function validateActionsAllowedByProfile(
  descriptor: ArtifactProfileDescriptor,
  actions: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (!descriptor.suggestedActions || actions === undefined) return;
  if (!Array.isArray(actions)) return;
  const allowedActionIds = new Set(descriptor.suggestedActions.map((action) => action.actionId));
  for (const [index, action] of actions.entries()) {
    if (!isRecord(action)) continue;
    const actionId = readOptionalString(action['actionId']);
    if (actionId && !allowedActionIds.has(actionId)) {
      diagnostics.push(
        artifactDiagnostic(
          'error',
          'invalid-profile',
          [...path, index, 'actionId'],
          `Action ${actionId} is not allowed by profile ${descriptor.profileId}.`,
          {
            expected: Array.from(allowedActionIds).join(', '),
            actual: actionId,
          },
        ),
      );
    }
  }
}

function validateResolvedSchemaRef(
  schemaRef: string,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  if (options.resolvedSchemaRefs && !options.resolvedSchemaRefs.includes(schemaRef)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'unresolved-schema-ref',
        path,
        'Profile schemaRef is not resolved.',
        {
          actual: schemaRef,
        },
      ),
    );
  }
}

function validateJsonShape(
  value: unknown,
  shape: ArtifactJsonShapeRule,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  for (const key of shape.requiredKeys ?? []) {
    if (value[key] === undefined) {
      diagnostics.push(
        artifactDiagnostic(
          'error',
          'profile-required-cell-missing',
          [...path, key],
          `JSON shape requires key ${key}.`,
          {
            expected: key,
          },
        ),
      );
    }
  }
  for (const [key, expectedType] of Object.entries(shape.fieldTypes ?? {})) {
    if (value[key] === undefined) continue;
    if (!matchesJsonShapeType(value[key], expectedType)) {
      diagnostics.push(invalidFieldDiagnostic([...path, key], expectedType, value[key]));
    }
  }
  for (const [key, maxLength] of Object.entries(shape.maxArrayLengths ?? {})) {
    const candidate = value[key];
    if (Array.isArray(candidate) && candidate.length > maxLength) {
      diagnostics.push(
        artifactDiagnostic(
          'error',
          'invalid-required-field',
          [...path, key],
          `Array ${key} exceeds profile maximum length.`,
          {
            expected: `<= ${maxLength}`,
            actual: candidate.length,
          },
        ),
      );
    }
  }
}

function matchesJsonShapeType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    case 'object':
      return isRecord(value) && !Array.isArray(value);
    default:
      return typeof value === expectedType;
  }
}

function findProfileDescriptor(
  profileId: string,
  profileVersion: unknown,
  options: ArtifactValidationOptions,
  diagnostics: ArtifactDiagnostic[],
): ArtifactProfileDescriptor | undefined {
  const descriptors = options.profiles ?? [];
  const version = typeof profileVersion === 'number' ? profileVersion : undefined;
  if (version !== undefined) {
    const exact = descriptors.find(
      (descriptor) => descriptor.profileId === profileId && descriptor.version === version,
    );
    if (exact) {
      return isArtifactProfileUsableForValidation(exact, diagnostics, options) ? exact : undefined;
    }
    const profileExists = descriptors.some((descriptor) => descriptor.profileId === profileId);
    const severity = profileExists || options.persisted ? 'error' : 'warning';
    diagnostics.push(
      artifactDiagnostic(
        severity,
        profileExists ? 'unsupported-profile-version' : 'missing-profile-descriptor',
        ['profile'],
        profileExists
          ? 'Profile descriptor exists but not for the requested profileVersion.'
          : 'No profile descriptor is available for this profile.',
        {
          actual: profileExists ? version : profileId,
        },
      ),
    );
    return undefined;
  }
  const descriptor = descriptors.find((candidate) => candidate.profileId === profileId);
  if (!descriptor) {
    diagnostics.push(
      artifactDiagnostic(
        options.persisted ? 'error' : 'warning',
        'missing-profile-descriptor',
        ['profile'],
        'No profile descriptor is available for this profile.',
        { actual: profileId },
      ),
    );
  }
  if (!descriptor) return undefined;
  return isArtifactProfileUsableForValidation(descriptor, diagnostics, options)
    ? descriptor
    : undefined;
}

function isArtifactProfileUsableForValidation(
  descriptor: ArtifactProfileDescriptor,
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): boolean {
  if (!options.persisted || descriptor.source !== 'skill-local') {
    return true;
  }

  diagnostics.push(
    artifactDiagnostic(
      'error',
      'skill-local-profile-persisted',
      ['profile'],
      'Persisted artifacts cannot reference skill-local profile descriptors.',
      {
        expected: 'builtin, package, market, project, personal',
        actual: descriptor.source,
        details: {
          profileId: descriptor.profileId,
          profileVersion: descriptor.version,
        },
      },
    ),
  );
  return false;
}

function validateOptionalProfileVersion(
  value: Record<string, unknown>,
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  if (value['profileVersion'] !== undefined && !Number.isInteger(value['profileVersion'])) {
    diagnostics.push(
      invalidFieldDiagnostic(['profileVersion'], 'integer', value['profileVersion']),
    );
  }
  if (
    options.persisted &&
    options.requireProfileVersionForPersisted &&
    value['profile'] !== undefined &&
    value['profileVersion'] === undefined
  ) {
    diagnostics.push(
      artifactDiagnostic(
        'warning',
        'unsupported-profile-version',
        ['profileVersion'],
        'Persisted profiled artifact should declare profileVersion.',
      ),
    );
  }
}

function validateMediaItem(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  requireString(value['itemId'], [...path, 'itemId'], diagnostics);
  if (!isArtifactMediaType(value['mediaType'])) {
    diagnostics.push(
      invalidFieldDiagnostic(
        [...path, 'mediaType'],
        ARTIFACT_MEDIA_TYPES.join(', '),
        value['mediaType'],
      ),
    );
  }
  validateArtifactResourceRef(value['resourceRef'], [...path, 'resourceRef'], diagnostics);
  validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
  void options;
}

function validateComparisonCandidate(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  requireString(value['candidateId'], [...path, 'candidateId'], diagnostics);
  if (value['media'] !== undefined)
    validateMediaItem(value['media'], [...path, 'media'], diagnostics, options);
  validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
}

function validateTimelineCue(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  requireString(value['cueId'], [...path, 'cueId'], diagnostics);
  requireFiniteNumber(value['startMs'], [...path, 'startMs'], diagnostics);
  if (value['durationMs'] !== undefined)
    requireFiniteNumber(value['durationMs'], [...path, 'durationMs'], diagnostics);
  if (value['resourceRef'] !== undefined)
    validateArtifactResourceRef(value['resourceRef'], [...path, 'resourceRef'], diagnostics);
  validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
  void options;
}

function validateArtifactResourceRef(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'invalid-resource-ref',
        path,
        'Artifact resource ref must be an object.',
      ),
    );
    return;
  }
  requireString(value['kind'], [...path, 'kind'], diagnostics);
  validateSerializableValue(value, path, diagnostics);
}

function validateActionsArray(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (value === undefined) return;
  validateArray(value, path, diagnostics, (action, actionPath) =>
    validateAction(action, actionPath, diagnostics),
  );
}

function validateAction(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  requireString(value['actionId'], [...path, 'actionId'], diagnostics);
  if (!isArtifactActionKind(value['kind'])) {
    diagnostics.push(
      invalidFieldDiagnostic([...path, 'kind'], ARTIFACT_ACTION_KINDS.join(', '), value['kind']),
    );
  }
  if (value['metadata'] !== undefined) {
    validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
  }
}

function validateDiagnosticsArray(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (value === undefined) return;
  validateArray(value, path, diagnostics, (diagnostic, diagnosticPath) =>
    validateDiagnostic(diagnostic, diagnosticPath, diagnostics),
  );
}

function validateDiagnostic(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  if (!ARTIFACT_DIAGNOSTIC_SEVERITIES.includes(value['severity'] as ArtifactDiagnosticSeverity)) {
    diagnostics.push(
      invalidFieldDiagnostic(
        [...path, 'severity'],
        ARTIFACT_DIAGNOSTIC_SEVERITIES.join(', '),
        value['severity'],
      ),
    );
  }
  requireString(value['code'], [...path, 'code'], diagnostics);
  if (!Array.isArray(value['path'])) {
    diagnostics.push(invalidFieldDiagnostic([...path, 'path'], 'array', value['path']));
  }
  requireString(value['message'], [...path, 'message'], diagnostics);
}

function validateExtensions(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  for (const [key, extensionValue] of Object.entries(value)) {
    if (!key.startsWith('neko.')) {
      diagnostics.push(
        artifactDiagnostic(
          'error',
          'invalid-extension-namespace',
          [...path, key],
          'Artifact extension keys must use neko.* namespace.',
          {
            actual: key,
          },
        ),
      );
    }
    validateSerializableValue(extensionValue, [...path, key], diagnostics);
  }
}

function validateSerializableValue(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isArtifactJsonValue(value)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'non-serializable-value',
        path,
        'Value must be JSON-serializable artifact data.',
      ),
    );
    return;
  }
  if (typeof value === 'string' && isUnsafeRuntimeHandle(value)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'unsafe-runtime-handle',
        path,
        'Artifact data must not persist runtime-only handles.',
        {
          actual: value,
        },
      ),
    );
  }
}

function validateSchemaVersion(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (value !== COMPOSITE_ARTIFACT_SCHEMA_VERSION) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'invalid-schema-version',
        [...path, 'schemaVersion'],
        'Artifact schemaVersion must be 1.',
        {
          expected: '1',
          actual: serializableDiagnosticValue(value),
        },
      ),
    );
  }
}

function validateLiteralKind(
  value: unknown,
  expected: string,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (value !== expected) {
    diagnostics.push(
      artifactDiagnostic('error', 'invalid-kind', path, `Artifact kind must be ${expected}.`, {
        expected,
        actual: serializableDiagnosticValue(value),
      }),
    );
  }
}

function validateArray(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
  validateItem: (item: unknown, itemPath: readonly ArtifactPathSegment[]) => void,
): void {
  if (!Array.isArray(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'array', value));
    return;
  }
  value.forEach((item, index) => validateItem(item, [...path, index]));
}

function validateStringArray(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  validateArray(value, path, diagnostics, (item, itemPath) => {
    if (typeof item !== 'string')
      diagnostics.push(invalidFieldDiagnostic(itemPath, 'string', item));
  });
}

function validateResourceMediaTypes(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (value === undefined) return;
  validateArray(value, path, diagnostics, (item, itemPath) => {
    if (!isArtifactMediaType(item)) {
      diagnostics.push(invalidFieldDiagnostic(itemPath, ARTIFACT_MEDIA_TYPES.join(', '), item));
    }
  });
}

function requireString(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostics.push(missingRequiredDiagnostic(path, String(path[path.length - 1] ?? 'field')));
  } else if (isUnsafeRuntimeHandle(value)) {
    diagnostics.push(
      artifactDiagnostic(
        'error',
        'unsafe-runtime-handle',
        path,
        'Artifact strings must not persist runtime-only handles.',
        {
          actual: value,
        },
      ),
    );
  }
}

function requireFiniteNumber(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ArtifactDiagnostic[],
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'finite number', value));
  }
}

function missingRequiredDiagnostic(
  path: readonly ArtifactPathSegment[],
  fieldName: string,
): ArtifactDiagnostic {
  return artifactDiagnostic(
    'error',
    'missing-required-field',
    path,
    `Missing required field: ${fieldName}.`,
  );
}

function invalidFieldDiagnostic(
  path: readonly ArtifactPathSegment[],
  expected: string,
  actual: unknown,
): ArtifactDiagnostic {
  return artifactDiagnostic(
    'error',
    'invalid-required-field',
    path,
    `Invalid field at ${path.join('.')}.`,
    {
      expected,
      actual: serializableDiagnosticValue(actual),
    },
  );
}

function artifactValidationResult(
  diagnostics: readonly ArtifactDiagnostic[],
  options: ArtifactValidationOptions,
): ArtifactValidationResult {
  const limited = diagnostics.slice(0, options.maxDiagnostics ?? 96);
  return {
    ok: !limited.some((diagnostic) => diagnostic.severity === 'error'),
    diagnostics: limited,
  };
}

function artifactDiagnostic(
  severity: ArtifactDiagnosticSeverity,
  code: ArtifactDiagnosticCode,
  path: readonly ArtifactPathSegment[],
  message: string,
  extra: Omit<ArtifactDiagnostic, 'severity' | 'code' | 'path' | 'message'> = {},
): ArtifactDiagnostic {
  return {
    severity,
    code,
    path,
    message,
    ...extra,
  };
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isCellWithStringValue(
  cell: Record<string, unknown>,
): cell is Record<string, unknown> & { readonly value: string } {
  return typeof cell['value'] === 'string';
}

function readProfileCellMediaType(cell: Record<string, unknown>): ArtifactMediaType | undefined {
  const value = cell['value'];
  if (!isRecord(value)) return undefined;
  const mediaType = value['mediaType'];
  return isArtifactMediaType(mediaType) ? mediaType : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCompositeArtifactBlockKind(value: unknown): value is CompositeArtifactBlockKind {
  return (
    typeof value === 'string' &&
    COMPOSITE_ARTIFACT_BLOCK_KINDS.includes(value as CompositeArtifactBlockKind)
  );
}

function isGenericTableCellType(value: unknown): value is GenericTableCellType {
  return (
    typeof value === 'string' && GENERIC_TABLE_CELL_TYPES.includes(value as GenericTableCellType)
  );
}

function isArtifactActionKind(value: unknown): value is ArtifactActionKind {
  return typeof value === 'string' && ARTIFACT_ACTION_KINDS.includes(value as ArtifactActionKind);
}

function isArtifactMediaType(value: unknown): value is ArtifactMediaType {
  return typeof value === 'string' && ARTIFACT_MEDIA_TYPES.includes(value as ArtifactMediaType);
}

function isArtifactJsonValue(value: unknown): value is ArtifactJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return Number.isFinite(value as number) || typeof value !== 'number';
  }
  if (Array.isArray(value)) {
    return value.every(isArtifactJsonValue);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isArtifactJsonValue);
  }
  return false;
}

function serializableDiagnosticValue(value: unknown): ArtifactJsonValue | undefined {
  return isArtifactJsonValue(value) ? value : String(value);
}

function jsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isUnsafeRuntimeHandle(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.startsWith('blob:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('vscode-resource:') ||
    normalized.startsWith('vscode-webview-resource:') ||
    normalized.startsWith('file:') ||
    normalized.startsWith('http://localhost') ||
    normalized.startsWith('http://127.0.0.1') ||
    normalized.startsWith('https://localhost') ||
    normalized.startsWith('https://127.0.0.1')
  ) {
    return true;
  }
  if (/^\/(?:tmp|var\/folders)\//.test(value)) return true;
  if (value.startsWith('/') && !value.startsWith('${')) return true;
  if (/^[a-z]:\\/i.test(value)) return true;
  if (/^\/users\/[^/]+\/library\/application support\//i.test(value)) return true;
  return false;
}
