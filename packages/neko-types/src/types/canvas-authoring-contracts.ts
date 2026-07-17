import type { CanvasNodeType, ConnectionType } from './canvas';
import type { CanvasAgentProvenance, CanvasAgentTargetRef } from './canvas-agent-operations';
import type { JsonPointerPath } from './canvas-layered';

export const CANVAS_AUTHORING_CATALOG_VERSION = 1 as const;

export const CANVAS_AUTHORING_CATALOG_SECTIONS = [
  'nodeTypes',
  'presets',
  'containers',
  'connections',
  'targetableFields',
  'resourcePolicies',
  'operations',
  'recipes',
  'fieldProfiles',
  'semanticPrompts',
] as const;

export type CanvasAuthoringCatalogVersion = typeof CANVAS_AUTHORING_CATALOG_VERSION;

export type CanvasAuthoringCatalogSection = (typeof CANVAS_AUTHORING_CATALOG_SECTIONS)[number];

export const CANVAS_AUTHORING_OPERATION_KINDS = [
  'query',
  'mutation',
  'generation',
  'import',
  'validation',
] as const;

export type CanvasAuthoringOperationKind = (typeof CANVAS_AUTHORING_OPERATION_KINDS)[number];

export const CANVAS_AUTHORING_OPERATION_RISKS = ['read-only', 'low', 'medium', 'high'] as const;

export type CanvasAuthoringOperationRisk = (typeof CANVAS_AUTHORING_OPERATION_RISKS)[number];

export const CANVAS_AUTHORING_OPERATION_STATUSES = ['available', 'unavailable'] as const;

export type CanvasAuthoringOperationStatus = (typeof CANVAS_AUTHORING_OPERATION_STATUSES)[number];

export const CANVAS_AUTHORING_RESULT_STATUSES = ['success', 'partial', 'blocked', 'noop'] as const;

export type CanvasAuthoringResultStatus = (typeof CANVAS_AUTHORING_RESULT_STATUSES)[number];

export const CANVAS_AUTHORING_FIELD_VALUE_TYPES = [
  'text',
  'number',
  'duration',
  'boolean',
  'enum',
  'resource-token',
  'resource-ref',
  'entity-ref',
  'prompt',
  'voice-cue',
  'character-appearance',
  'action',
  'status',
  'result-ref',
  'object',
  'array',
] as const;

export type CanvasAuthoringFieldValueType = (typeof CANVAS_AUTHORING_FIELD_VALUE_TYPES)[number];

export const CANVAS_AUTHORING_FIELD_ROLES = [
  'scene',
  'shot',
  'character',
  'character-appearance',
  'voice',
  'prompt',
  'media',
  'execution',
  'review',
  'metadata',
  'style',
  'camera',
  'dialogue',
] as const;

export type CanvasAuthoringFieldRole = (typeof CANVAS_AUTHORING_FIELD_ROLES)[number];

export const CANVAS_AUTHORING_FIELD_CARDINALITIES = ['optional', 'required', 'repeated'] as const;

export type CanvasAuthoringFieldCardinality = (typeof CANVAS_AUTHORING_FIELD_CARDINALITIES)[number];

export const CANVAS_AUTHORING_FIELD_STORAGE_TARGETS = [
  'node-data',
  'node-extension',
  'prompt-span',
  'review-metadata',
  'capability-input',
  'custom-metadata',
] as const;

export type CanvasAuthoringFieldStorageTarget =
  (typeof CANVAS_AUTHORING_FIELD_STORAGE_TARGETS)[number];

export const CANVAS_AUTHORING_PROMPT_SPAN_BEHAVIORS = [
  'none',
  'source-of-truth',
  'field-projection',
  'bidirectional',
  'suggestion-only',
] as const;

export type CanvasAuthoringPromptSpanBehavior =
  (typeof CANVAS_AUTHORING_PROMPT_SPAN_BEHAVIORS)[number];

export const CANVAS_AUTHORING_FIELD_PROFILE_ALIGNMENT_STATES = [
  'in-sync',
  'prompt-overridden',
  'fields-changed',
  'conflict',
  'unbound',
  'suggestion-pending',
] as const;

export type CanvasAuthoringFieldProfileAlignmentState =
  (typeof CANVAS_AUTHORING_FIELD_PROFILE_ALIGNMENT_STATES)[number];

export const CANVAS_AUTHORING_PROMPT_REFERENCE_STATUSES = [
  'resolved',
  'unresolved',
  'ambiguous',
] as const;

export type CanvasAuthoringPromptReferenceStatus =
  (typeof CANVAS_AUTHORING_PROMPT_REFERENCE_STATUSES)[number];

export const CANVAS_AUTHORING_REF_KINDS = [
  'canvas',
  'node',
  'connection',
  'resource',
  'field',
  'block',
  'operation',
] as const;

export type CanvasAuthoringRefKind = (typeof CANVAS_AUTHORING_REF_KINDS)[number];

export type CanvasAuthoringDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface CanvasAuthoringDiagnostic {
  readonly severity: CanvasAuthoringDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly target?: string;
  readonly expected?: unknown;
  readonly received?: unknown;
  readonly retryable?: boolean;
  readonly requiredQuery?: string;
  readonly suggestedActions?: readonly CanvasAuthoringSuggestedAction[];
}

export interface CanvasAuthoringSuggestedAction {
  readonly id: string;
  readonly label?: string;
  readonly toolName?: string;
  readonly requiresApproval?: boolean;
  readonly arguments?: Readonly<Record<string, unknown>>;
}

export interface CanvasAuthoringValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly CanvasAuthoringDiagnostic[];
}

export interface CanvasAuthoringCatalogRequest {
  readonly version?: CanvasAuthoringCatalogVersion;
  readonly sections?: readonly CanvasAuthoringCatalogSection[];
  readonly includeDetails?: boolean;
  readonly filters?: Readonly<Record<string, unknown>>;
}

export interface CanvasAuthoringLocalizedText {
  readonly default: string;
  readonly zhCN?: string;
  readonly en?: string;
}

export interface CanvasAuthoringRef {
  readonly kind: CanvasAuthoringRefKind;
  readonly id: string;
  readonly canvasId?: string;
  readonly nodeId?: string;
  readonly connectionId?: string;
  readonly fieldPath?: JsonPointerPath;
  readonly label?: string;
}

export interface CanvasAuthoringTargetableFieldDescriptor {
  readonly id: string;
  readonly path: JsonPointerPath;
  readonly label?: CanvasAuthoringLocalizedText;
  readonly valueType: CanvasAuthoringFieldValueType | string;
  readonly roles?: readonly (CanvasAuthoringFieldRole | string)[];
  readonly required?: boolean;
  readonly storageTarget?: CanvasAuthoringFieldStorageTarget | string;
  readonly aliases?: readonly string[];
  readonly namespace?: string;
  readonly cardinality?: CanvasAuthoringFieldCardinality;
  readonly promptSpan?: CanvasAuthoringPromptSpanDescriptor;
  readonly capabilityBinding?: CanvasAuthoringCapabilityBindingDescriptor;
}

export interface CanvasAuthoringNodeTypeDescriptor {
  readonly type: CanvasNodeType | string;
  readonly label?: CanvasAuthoringLocalizedText;
  readonly summary?: string;
  readonly defaultPreset?: string;
  readonly presets?: readonly string[];
  readonly targetableFields?: readonly CanvasAuthoringTargetableFieldDescriptor[];
}

export interface CanvasAuthoringPresetDescriptor {
  readonly id: string;
  readonly nodeType: CanvasNodeType | string;
  readonly label?: CanvasAuthoringLocalizedText;
  readonly summary?: string;
  readonly containerPolicyId?: string;
  readonly targetableFields?: readonly CanvasAuthoringTargetableFieldDescriptor[];
  readonly traits?: readonly string[];
}

export interface CanvasAuthoringContainerPolicyDescriptor {
  readonly id: string;
  readonly label?: CanvasAuthoringLocalizedText;
  readonly acceptedChildNodeTypes?: readonly (CanvasNodeType | string)[];
  readonly acceptedChildPresets?: readonly string[];
  readonly maxChildren?: number;
  readonly layoutModes?: readonly string[];
  readonly slots?: readonly CanvasAuthoringContainerSlotDescriptor[];
}

export interface CanvasAuthoringContainerSlotDescriptor {
  readonly id: string;
  readonly label?: CanvasAuthoringLocalizedText;
  readonly acceptedChildNodeTypes?: readonly (CanvasNodeType | string)[];
  readonly acceptedChildPresets?: readonly string[];
  readonly required?: boolean;
}

export interface CanvasAuthoringConnectionDescriptor {
  readonly type: ConnectionType | string;
  readonly label?: CanvasAuthoringLocalizedText;
  readonly sourceNodeTypes?: readonly (CanvasNodeType | string)[];
  readonly targetNodeTypes?: readonly (CanvasNodeType | string)[];
  readonly sourceEndpointScopes?: readonly string[];
  readonly targetEndpointScopes?: readonly string[];
  readonly extensionSchema?: Readonly<Record<string, unknown>>;
}

export interface CanvasAuthoringResourcePolicyDescriptor {
  readonly id: string;
  readonly label?: CanvasAuthoringLocalizedText;
  readonly stableRefKinds: readonly string[];
  readonly rejectedRuntimeKinds?: readonly string[];
}

export interface CanvasAuthoringRecipeDescriptor {
  readonly id: string;
  readonly label?: CanvasAuthoringLocalizedText;
  readonly summary: string;
  readonly preferredTools: readonly string[];
  readonly requiredQueries?: readonly string[];
  readonly targetHints?: readonly string[];
}

export interface CanvasAuthoringOperationDescriptor {
  readonly id: string;
  readonly kind: CanvasAuthoringOperationKind;
  readonly risk: CanvasAuthoringOperationRisk;
  readonly status: CanvasAuthoringOperationStatus;
  readonly toolName?: string;
  readonly label?: CanvasAuthoringLocalizedText;
  readonly summary?: string;
  readonly requiresConfirmation?: boolean;
  readonly targetRequirements?: readonly string[];
  readonly preferredQueryTools?: readonly string[];
  readonly unavailableReason?: string;
}

export interface CanvasAuthoringCatalog {
  readonly version: CanvasAuthoringCatalogVersion;
  readonly sections: readonly CanvasAuthoringCatalogSection[];
  readonly nodeTypes?: readonly CanvasAuthoringNodeTypeDescriptor[];
  readonly presets?: readonly CanvasAuthoringPresetDescriptor[];
  readonly containers?: readonly CanvasAuthoringContainerPolicyDescriptor[];
  readonly connections?: readonly CanvasAuthoringConnectionDescriptor[];
  readonly targetableFields?: readonly CanvasAuthoringTargetableFieldDescriptor[];
  readonly resourcePolicies?: readonly CanvasAuthoringResourcePolicyDescriptor[];
  readonly operations?: readonly CanvasAuthoringOperationDescriptor[];
  readonly recipes?: readonly CanvasAuthoringRecipeDescriptor[];
  readonly fieldProfiles?: readonly CanvasAuthoringFieldProfileDescriptor[];
  readonly semanticPrompts?: CanvasAuthoringSemanticPromptSupportDescriptor;
  readonly diagnostics: readonly CanvasAuthoringDiagnostic[];
}

export interface CanvasAuthoringFieldProfileDescriptor {
  readonly id: string;
  readonly namespace: string;
  readonly version: number;
  readonly aliases?: readonly string[];
  readonly label?: CanvasAuthoringLocalizedText;
  readonly unknownFieldPolicy?: 'preserve-custom' | 'diagnose' | 'reject';
  readonly fields: readonly CanvasAuthoringFieldDescriptor[];
}

export interface CanvasAuthoringFieldDescriptor {
  readonly id: string;
  readonly namespace: string;
  readonly aliases?: readonly string[];
  readonly label?: CanvasAuthoringLocalizedText;
  readonly valueType: CanvasAuthoringFieldValueType | string;
  readonly roles: readonly (CanvasAuthoringFieldRole | string)[];
  readonly cardinality?: CanvasAuthoringFieldCardinality;
  readonly storageTarget: CanvasAuthoringFieldStorageTarget | string;
  readonly path?: JsonPointerPath;
  readonly required?: boolean;
  readonly enumValues?: readonly string[];
  readonly promptSpan?: CanvasAuthoringPromptSpanDescriptor;
  readonly capabilityBinding?: CanvasAuthoringCapabilityBindingDescriptor;
}

export interface CanvasAuthoringPromptSpanDescriptor {
  readonly behavior: CanvasAuthoringPromptSpanBehavior;
  readonly spanKind?: string;
  readonly fieldId?: string;
  readonly alignmentState?: CanvasAuthoringFieldProfileAlignmentState;
}

export interface CanvasAuthoringCapabilityBindingDescriptor {
  readonly capabilityId: string;
  readonly operationId?: string;
  readonly inputField?: string;
  readonly requiresApproval?: boolean;
  readonly stableRefRequired?: boolean;
  readonly targetRefKinds?: readonly CanvasAuthoringRefKind[];
}

export interface CanvasAuthoringSemanticPromptSupportDescriptor {
  readonly supported: boolean;
  readonly promptBlockKinds?: readonly string[];
  readonly promptContentProfiles?: readonly CanvasAuthoringPromptContentProfileDescriptor[];
  readonly spanKinds?: readonly string[];
  readonly alignmentStates?: readonly string[];
  readonly referenceMediaRoles?: readonly string[];
  readonly referenceMediaKinds?: readonly string[];
  readonly metadataPolicies?: readonly CanvasAuthoringPromptMetadataPolicyDescriptor[];
  readonly promotionRules?: readonly CanvasAuthoringPromptMetadataPromotionRuleDescriptor[];
  readonly advancedParameterIds?: readonly string[];
  readonly nextCreativeStateIds?: readonly string[];
  readonly nextCreativeStateTargets?: readonly string[];
  readonly actionIntentIds?: readonly string[];
  readonly primaryStoryboardColumns?: readonly string[];
  readonly progressOwner?: 'agent' | 'canvas';
  readonly commands?: readonly string[];
}

export interface CanvasAuthoringPromptContentPartDescriptor {
  readonly id: string;
  readonly label?: CanvasAuthoringLocalizedText;
  readonly summary?: string;
  readonly required?: boolean;
  readonly mapsToSpanKind?: string;
  readonly mapsToFieldId?: string;
  readonly mapsToParameterId?: string;
}

export interface CanvasAuthoringPromptContentProfileDescriptor {
  readonly id: string;
  readonly blockKind: string;
  readonly label?: CanvasAuthoringLocalizedText;
  readonly summary?: string;
  readonly generationEffectiveParts: readonly CanvasAuthoringPromptContentPartDescriptor[];
  readonly referenceKinds?: readonly string[];
  readonly parameterIds?: readonly string[];
}

export interface CanvasAuthoringPromptMetadataPolicyDescriptor {
  readonly id: string;
  readonly label?: CanvasAuthoringLocalizedText;
  readonly fieldIds: readonly string[];
  readonly defaultStorageTarget: 'review-metadata' | 'custom-metadata';
  readonly generationEffect: 'none' | 'suggestion-only';
  readonly summary?: string;
}

export interface CanvasAuthoringPromptMetadataPromotionRuleDescriptor {
  readonly id: string;
  readonly from: 'markdown-extension' | 'review-metadata' | 'skill-field';
  readonly to:
    'semantic-prompt-span' | 'generation-parameter' | 'reference-media' | 'action-payload';
  readonly requiresConfirmation: boolean;
  readonly summary: string;
}

export interface CanvasAuthoringSourceRange {
  readonly start: number;
  readonly end: number;
}

export interface CanvasAuthoringSemanticPromptSpan {
  readonly id?: string;
  readonly kind: string;
  readonly range: CanvasAuthoringSourceRange;
  readonly fieldId?: string;
  readonly ref?: CanvasAuthoringRef;
  readonly referenceStatus?: CanvasAuthoringPromptReferenceStatus;
  readonly source?: 'prompt' | 'field' | 'markdown' | 'agent' | 'user';
}

export interface CanvasAuthoringPromptFieldProjection {
  readonly fieldId: string;
  readonly value?: unknown;
  readonly sourceSpanId?: string;
  readonly alignmentState: CanvasAuthoringFieldProfileAlignmentState;
  readonly userOverride?: boolean;
  readonly fieldEditedAt?: number;
  readonly promptEditedAt?: number;
}

export interface CanvasAuthoringPromptFieldSuggestion {
  readonly fieldId: string;
  readonly suggestedValue: unknown;
  readonly sourceRange?: CanvasAuthoringSourceRange;
  readonly confidence?: number;
}

export interface CanvasAuthoringSemanticPromptDocument {
  readonly text: string;
  readonly spans?: readonly CanvasAuthoringSemanticPromptSpan[];
  readonly fieldProjections?: readonly CanvasAuthoringPromptFieldProjection[];
  readonly fieldSuggestions?: readonly CanvasAuthoringPromptFieldSuggestion[];
  readonly userOverride?: boolean;
  readonly profileId?: string;
}

export interface CanvasAuthoringSemanticPromptValidationOptions {
  readonly fieldProfiles?: readonly CanvasAuthoringFieldProfileDescriptor[];
}

export interface CanvasAuthoringResultEnvelope {
  readonly version: CanvasAuthoringCatalogVersion;
  readonly status: CanvasAuthoringResultStatus;
  readonly refs: readonly CanvasAuthoringRef[];
  readonly diagnostics: readonly CanvasAuthoringDiagnostic[];
  readonly changedFields?: readonly string[];
  readonly blockedReason?: string;
  readonly nextActions?: readonly CanvasAuthoringSuggestedAction[];
  readonly target?: CanvasAgentTargetRef;
  readonly provenance?: CanvasAgentProvenance;
  readonly summary?: string;
}

const RUNTIME_RESOURCE_IDENTITY_PATTERNS: readonly RegExp[] = [
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

export function validateCanvasAuthoringCatalogRequest(
  value: unknown,
): CanvasAuthoringValidationResult {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      diagnostics: [
        diagnostic('error', 'malformed-catalog-request', 'Catalog request must be an object.'),
      ],
    };
  }
  const version = value['version'];
  if (version !== undefined && version !== CANVAS_AUTHORING_CATALOG_VERSION) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-catalog-version',
        'Unsupported Canvas authoring catalog version.',
        {
          target: 'version',
          expected: CANVAS_AUTHORING_CATALOG_VERSION,
          received: version,
        },
      ),
    );
  }
  const sections = value['sections'];
  if (sections !== undefined) {
    if (!Array.isArray(sections)) {
      diagnostics.push(
        diagnostic('error', 'malformed-catalog-sections', 'Catalog sections must be an array.', {
          target: 'sections',
          received: sections,
        }),
      );
    } else {
      sections.forEach((section, index) => {
        if (!isCanvasAuthoringCatalogSection(section)) {
          diagnostics.push(
            diagnostic(
              'error',
              'unsupported-catalog-section',
              'Unsupported Canvas authoring catalog section.',
              {
                target: `sections[${index}]`,
                expected: CANVAS_AUTHORING_CATALOG_SECTIONS,
                received: section,
              },
            ),
          );
        }
      });
    }
  }
  return validationResult(diagnostics);
}

export function validateCanvasAuthoringCatalog(value: unknown): CanvasAuthoringValidationResult {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      diagnostics: [
        diagnostic('error', 'malformed-catalog', 'Canvas authoring catalog must be an object.'),
      ],
    };
  }
  if (value['version'] !== CANVAS_AUTHORING_CATALOG_VERSION) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-catalog-version',
        'Unsupported Canvas authoring catalog version.',
        {
          target: 'version',
          expected: CANVAS_AUTHORING_CATALOG_VERSION,
          received: value['version'],
        },
      ),
    );
  }
  const sections = value['sections'];
  if (!Array.isArray(sections) || !sections.every(isCanvasAuthoringCatalogSection)) {
    diagnostics.push(
      diagnostic(
        'error',
        'malformed-catalog-sections',
        'Catalog sections must be supported section ids.',
        {
          target: 'sections',
          received: sections,
        },
      ),
    );
  }
  const operations = value['operations'];
  if (operations !== undefined) {
    if (!Array.isArray(operations)) {
      diagnostics.push(
        diagnostic(
          'error',
          'malformed-operation-descriptor',
          'Catalog operations must be an array.',
          {
            target: 'operations',
            received: operations,
          },
        ),
      );
    } else {
      operations.forEach((operation, index) => {
        if (!isCanvasAuthoringOperationDescriptor(operation)) {
          diagnostics.push(
            diagnostic(
              'error',
              'malformed-operation-descriptor',
              'Canvas authoring operation descriptor is malformed.',
              { target: `operations[${index}]`, received: operation },
            ),
          );
        }
      });
    }
  }
  const catalogDiagnostics = value['diagnostics'];
  if (
    catalogDiagnostics !== undefined &&
    (!Array.isArray(catalogDiagnostics) || !catalogDiagnostics.every(isCanvasAuthoringDiagnostic))
  ) {
    diagnostics.push(
      diagnostic('error', 'malformed-authoring-diagnostic', 'Catalog diagnostics are malformed.', {
        target: 'diagnostics',
        received: catalogDiagnostics,
      }),
    );
  }
  return validationResult(diagnostics);
}

export function validateCanvasAuthoringResultEnvelope(
  value: unknown,
): CanvasAuthoringValidationResult {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      diagnostics: [
        diagnostic(
          'error',
          'malformed-authoring-result',
          'Canvas authoring result must be an object.',
        ),
      ],
    };
  }
  if (value['version'] !== CANVAS_AUTHORING_CATALOG_VERSION) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-catalog-version',
        'Unsupported Canvas authoring result version.',
        {
          target: 'version',
          expected: CANVAS_AUTHORING_CATALOG_VERSION,
          received: value['version'],
        },
      ),
    );
  }
  if (!includesString(CANVAS_AUTHORING_RESULT_STATUSES, value['status'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'malformed-authoring-status',
        'Canvas authoring result status is unsupported.',
        {
          target: 'status',
          expected: CANVAS_AUTHORING_RESULT_STATUSES,
          received: value['status'],
        },
      ),
    );
  }
  const refs = value['refs'];
  if (!Array.isArray(refs)) {
    diagnostics.push(
      diagnostic('error', 'malformed-authoring-ref', 'Canvas authoring refs must be an array.', {
        target: 'refs',
        received: refs,
      }),
    );
  } else {
    refs.forEach((ref, index) => {
      const target = `refs[${index}]`;
      if (!isCanvasAuthoringRef(ref)) {
        diagnostics.push(
          diagnostic('error', 'malformed-authoring-ref', 'Canvas authoring ref is malformed.', {
            target,
            received: ref,
          }),
        );
        return;
      }
      if (ref.kind === 'resource' && isRuntimeOnlyCanvasAuthoringResourceIdentityValue(ref.id)) {
        diagnostics.push(
          diagnostic(
            'error',
            'runtime-only-resource-identity',
            'Canvas authoring resource refs must use durable identity, not runtime-only handles.',
            { target: `${target}.id`, received: ref.id },
          ),
        );
      }
    });
  }
  const resultDiagnostics = value['diagnostics'];
  if (!Array.isArray(resultDiagnostics) || !resultDiagnostics.every(isCanvasAuthoringDiagnostic)) {
    diagnostics.push(
      diagnostic(
        'error',
        'malformed-authoring-diagnostic',
        'Canvas authoring diagnostics are malformed.',
        {
          target: 'diagnostics',
          received: resultDiagnostics,
        },
      ),
    );
  }
  return validationResult(diagnostics);
}

export function validateCanvasAuthoringFieldProfileDescriptor(
  value: unknown,
): CanvasAuthoringValidationResult {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      diagnostics: [
        diagnostic(
          'error',
          'malformed-field-profile',
          'Canvas authoring field profile must be an object.',
        ),
      ],
    };
  }
  if (!isNonEmptyString(value['id'])) {
    diagnostics.push(
      diagnostic('error', 'malformed-field-profile', 'Field profile id is required.', {
        target: 'id',
        received: value['id'],
      }),
    );
  }
  if (!isNonEmptyString(value['namespace'])) {
    diagnostics.push(
      diagnostic('error', 'malformed-field-profile', 'Field profile namespace is required.', {
        target: 'namespace',
        received: value['namespace'],
      }),
    );
  }
  if (typeof value['version'] !== 'number' || value['version'] < 1) {
    diagnostics.push(
      diagnostic('error', 'malformed-field-profile', 'Field profile version must be positive.', {
        target: 'version',
        received: value['version'],
      }),
    );
  }
  if (value['aliases'] !== undefined && !optionalStringArray(value['aliases'])) {
    diagnostics.push(
      diagnostic('error', 'malformed-field-profile', 'Field profile aliases must be strings.', {
        target: 'aliases',
        received: value['aliases'],
      }),
    );
  }
  const fields = value['fields'];
  if (!Array.isArray(fields) || fields.length === 0) {
    diagnostics.push(
      diagnostic(
        'error',
        'malformed-field-profile',
        'Field profile must provide at least one field descriptor.',
        { target: 'fields', received: fields },
      ),
    );
  } else {
    fields.forEach((field, index) => {
      diagnostics.push(...validateCanvasAuthoringFieldDescriptor(field, `fields[${index}]`));
    });
  }
  return validationResult(diagnostics);
}

export function validateCanvasAuthoringSemanticPromptDocument(
  value: unknown,
  options: CanvasAuthoringSemanticPromptValidationOptions = {},
): CanvasAuthoringValidationResult {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      diagnostics: [
        diagnostic(
          'error',
          'malformed-semantic-prompt',
          'Canvas semantic prompt document must be an object.',
        ),
      ],
    };
  }
  const text = value['text'];
  if (typeof text !== 'string') {
    diagnostics.push(
      diagnostic('error', 'malformed-semantic-prompt', 'Prompt text is required.', {
        target: 'text',
        received: text,
      }),
    );
  }
  const knownFieldIds = collectCanvasAuthoringFieldIds(options.fieldProfiles);
  const spans = value['spans'];
  if (spans !== undefined) {
    if (!Array.isArray(spans)) {
      diagnostics.push(
        diagnostic('error', 'malformed-prompt-span', 'Semantic prompt spans must be an array.', {
          target: 'spans',
          received: spans,
        }),
      );
    } else {
      spans.forEach((span, index) => {
        diagnostics.push(
          ...validateCanvasAuthoringSemanticPromptSpan(
            span,
            `spans[${index}]`,
            typeof text === 'string' ? text.length : undefined,
            knownFieldIds,
          ),
        );
      });
    }
  }

  const fieldProjections = value['fieldProjections'];
  if (fieldProjections !== undefined) {
    if (!Array.isArray(fieldProjections)) {
      diagnostics.push(
        diagnostic(
          'error',
          'malformed-field-projection',
          'Prompt field projections must be an array.',
          { target: 'fieldProjections', received: fieldProjections },
        ),
      );
    } else {
      fieldProjections.forEach((projection, index) => {
        diagnostics.push(
          ...validateCanvasAuthoringPromptFieldProjection(
            projection,
            `fieldProjections[${index}]`,
            knownFieldIds,
          ),
        );
      });
    }
  }

  const fieldSuggestions = value['fieldSuggestions'];
  if (fieldSuggestions !== undefined) {
    if (!Array.isArray(fieldSuggestions)) {
      diagnostics.push(
        diagnostic(
          'error',
          'malformed-field-suggestion',
          'Prompt field suggestions must be an array.',
          { target: 'fieldSuggestions', received: fieldSuggestions },
        ),
      );
    } else {
      fieldSuggestions.forEach((suggestion, index) => {
        diagnostics.push(
          ...validateCanvasAuthoringPromptFieldSuggestion(
            suggestion,
            `fieldSuggestions[${index}]`,
            typeof text === 'string' ? text.length : undefined,
            knownFieldIds,
          ),
        );
      });
    }
  }

  if (value['userOverride'] === true) {
    diagnostics.push(
      diagnostic(
        'warning',
        'prompt-user-override-preserved',
        'Free-form prompt edits are preserved and do not overwrite Canvas fields without an explicit apply action.',
        {
          target: 'text',
          suggestedActions: [
            { id: 'keep-prompt', label: 'Keep prompt override' },
            { id: 'merge-fields-into-prompt', label: 'Merge fields into prompt' },
          ],
        },
      ),
    );
  }

  return validationResult(diagnostics);
}

function validateCanvasAuthoringFieldDescriptor(
  value: unknown,
  target: string,
): readonly CanvasAuthoringDiagnostic[] {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (!isRecord(value)) {
    return [
      diagnostic('error', 'malformed-field-descriptor', 'Field descriptor must be an object.', {
        target,
        received: value,
      }),
    ];
  }
  if (!isNonEmptyString(value['id'])) {
    diagnostics.push(
      diagnostic('error', 'malformed-field-descriptor', 'Field descriptor id is required.', {
        target: `${target}.id`,
        received: value['id'],
      }),
    );
  }
  if (!isNonEmptyString(value['namespace'])) {
    diagnostics.push(
      diagnostic('error', 'malformed-field-descriptor', 'Field descriptor namespace is required.', {
        target: `${target}.namespace`,
        received: value['namespace'],
      }),
    );
  }
  if (value['aliases'] !== undefined && !optionalStringArray(value['aliases'])) {
    diagnostics.push(
      diagnostic('error', 'malformed-field-descriptor', 'Field aliases must be strings.', {
        target: `${target}.aliases`,
        received: value['aliases'],
      }),
    );
  }
  if (!includesString(CANVAS_AUTHORING_FIELD_VALUE_TYPES, value['valueType'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-field-value-type',
        'Field descriptor valueType is unsupported.',
        {
          target: `${target}.valueType`,
          expected: CANVAS_AUTHORING_FIELD_VALUE_TYPES,
          received: value['valueType'],
        },
      ),
    );
  }
  const roles = value['roles'];
  if (
    !Array.isArray(roles) ||
    roles.length === 0 ||
    !roles.every((role) => includesString(CANVAS_AUTHORING_FIELD_ROLES, role))
  ) {
    diagnostics.push(
      diagnostic('error', 'unsupported-field-role', 'Field descriptor roles are unsupported.', {
        target: `${target}.roles`,
        expected: CANVAS_AUTHORING_FIELD_ROLES,
        received: roles,
      }),
    );
  }
  if (
    value['cardinality'] !== undefined &&
    !includesString(CANVAS_AUTHORING_FIELD_CARDINALITIES, value['cardinality'])
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-field-cardinality',
        'Field descriptor cardinality is unsupported.',
        {
          target: `${target}.cardinality`,
          expected: CANVAS_AUTHORING_FIELD_CARDINALITIES,
          received: value['cardinality'],
        },
      ),
    );
  }
  if (!includesString(CANVAS_AUTHORING_FIELD_STORAGE_TARGETS, value['storageTarget'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-field-storage-target',
        'Field descriptor storageTarget is unsupported.',
        {
          target: `${target}.storageTarget`,
          expected: CANVAS_AUTHORING_FIELD_STORAGE_TARGETS,
          received: value['storageTarget'],
        },
      ),
    );
  }
  if (value['promptSpan'] !== undefined) {
    diagnostics.push(...validateCanvasAuthoringPromptSpanDescriptor(value['promptSpan'], target));
  }
  if (value['capabilityBinding'] !== undefined) {
    diagnostics.push(
      ...validateCanvasAuthoringCapabilityBindingDescriptor(value['capabilityBinding'], target),
    );
  } else if (value['storageTarget'] === 'capability-input') {
    diagnostics.push(
      diagnostic(
        'error',
        'missing-capability-binding',
        'Fields stored as capability input must declare a capability binding.',
        { target: `${target}.capabilityBinding` },
      ),
    );
  }
  return diagnostics;
}

function validateCanvasAuthoringSemanticPromptSpan(
  value: unknown,
  target: string,
  textLength: number | undefined,
  knownFieldIds: ReadonlySet<string>,
): readonly CanvasAuthoringDiagnostic[] {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (!isRecord(value)) {
    return [
      diagnostic('error', 'malformed-prompt-span', 'Semantic prompt span must be an object.', {
        target,
        received: value,
      }),
    ];
  }
  if (!isNonEmptyString(value['kind'])) {
    diagnostics.push(
      diagnostic('error', 'malformed-prompt-span', 'Semantic prompt span kind is required.', {
        target: `${target}.kind`,
        received: value['kind'],
      }),
    );
  }
  diagnostics.push(
    ...validateCanvasAuthoringSourceRange(value['range'], `${target}.range`, textLength),
  );
  const fieldId = value['fieldId'];
  if (fieldId !== undefined) {
    if (!isNonEmptyString(fieldId)) {
      diagnostics.push(
        diagnostic('error', 'malformed-prompt-span', 'Semantic prompt span fieldId is malformed.', {
          target: `${target}.fieldId`,
          received: fieldId,
        }),
      );
    } else if (knownFieldIds.size > 0 && !knownFieldIds.has(fieldId)) {
      diagnostics.push(
        diagnostic(
          'warning',
          'unknown-prompt-field',
          'Semantic prompt span references an unknown Canvas field descriptor.',
          { target: `${target}.fieldId`, received: fieldId },
        ),
      );
    }
  }
  const referenceStatus = value['referenceStatus'];
  if (
    referenceStatus !== undefined &&
    !includesString(CANVAS_AUTHORING_PROMPT_REFERENCE_STATUSES, referenceStatus)
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-prompt-reference-status',
        'Semantic prompt reference status is unsupported.',
        {
          target: `${target}.referenceStatus`,
          expected: CANVAS_AUTHORING_PROMPT_REFERENCE_STATUSES,
          received: referenceStatus,
        },
      ),
    );
  }
  if (referenceStatus === 'unresolved' || referenceStatus === 'ambiguous') {
    diagnostics.push(
      diagnostic(
        'error',
        'unresolved-prompt-reference',
        'Semantic prompt reference must resolve to a stable ref before durable binding or execution.',
        {
          target,
          retryable: true,
          suggestedActions: [
            { id: 'query-active-context', toolName: 'canvas_get_active_context' },
            { id: 'ask-user-resolve-reference', label: 'Ask user to resolve reference' },
          ],
        },
      ),
    );
  }
  const ref = value['ref'];
  if (ref !== undefined) {
    if (!isCanvasAuthoringRef(ref)) {
      diagnostics.push(
        diagnostic('error', 'malformed-authoring-ref', 'Semantic prompt ref is malformed.', {
          target: `${target}.ref`,
          received: ref,
        }),
      );
    } else if (
      ref.kind === 'resource' &&
      isRuntimeOnlyCanvasAuthoringResourceIdentityValue(ref.id)
    ) {
      diagnostics.push(
        diagnostic(
          'error',
          'runtime-only-resource-identity',
          'Semantic prompt resource refs must use durable identity, not runtime-only handles.',
          { target: `${target}.ref.id`, received: ref.id },
        ),
      );
    }
  }
  return diagnostics;
}

function validateCanvasAuthoringPromptFieldProjection(
  value: unknown,
  target: string,
  knownFieldIds: ReadonlySet<string>,
): readonly CanvasAuthoringDiagnostic[] {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (!isRecord(value)) {
    return [
      diagnostic(
        'error',
        'malformed-field-projection',
        'Prompt field projection must be an object.',
        { target, received: value },
      ),
    ];
  }
  const fieldId = value['fieldId'];
  if (!isNonEmptyString(fieldId)) {
    diagnostics.push(
      diagnostic('error', 'malformed-field-projection', 'Field projection fieldId is required.', {
        target: `${target}.fieldId`,
        received: fieldId,
      }),
    );
  } else if (knownFieldIds.size > 0 && !knownFieldIds.has(fieldId)) {
    diagnostics.push(
      diagnostic(
        'warning',
        'unknown-field-projection',
        'Prompt field projection references an unknown Canvas field descriptor.',
        { target: `${target}.fieldId`, received: fieldId },
      ),
    );
  }
  const alignmentState = value['alignmentState'];
  if (!includesString(CANVAS_AUTHORING_FIELD_PROFILE_ALIGNMENT_STATES, alignmentState)) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-prompt-alignment-state',
        'Prompt field projection alignment state is unsupported.',
        {
          target: `${target}.alignmentState`,
          expected: CANVAS_AUTHORING_FIELD_PROFILE_ALIGNMENT_STATES,
          received: alignmentState,
        },
      ),
    );
    return diagnostics;
  }
  if (alignmentState === 'prompt-overridden' || value['userOverride'] === true) {
    diagnostics.push(
      diagnostic(
        'warning',
        'prompt-user-override-preserved',
        'Prompt override is preserved; Canvas fields require an explicit apply or merge action.',
        {
          target,
          suggestedActions: [
            { id: 'keep-prompt', label: 'Keep prompt override' },
            {
              id: 'apply-field-suggestion',
              label: 'Apply field suggestion',
              requiresApproval: true,
            },
          ],
        },
      ),
    );
  }
  if (alignmentState === 'fields-changed') {
    diagnostics.push(
      diagnostic(
        'warning',
        'prompt-fields-changed',
        'Canvas fields changed after prompt synchronization; prompt alignment requires an explicit next action.',
        {
          target,
          suggestedActions: [
            { id: 'regenerate-prompt', label: 'Regenerate prompt', requiresApproval: true },
            {
              id: 'merge-fields-into-prompt',
              label: 'Merge fields into prompt',
              requiresApproval: true,
            },
          ],
        },
      ),
    );
  }
  if (alignmentState === 'conflict') {
    diagnostics.push(
      diagnostic(
        'error',
        'prompt-field-conflict',
        'Prompt and Canvas field projection are in conflict and require explicit resolution.',
        {
          target,
          retryable: true,
          suggestedActions: [
            { id: 'ask-agent-merge', label: 'Ask Agent to propose a merge' },
            { id: 'ask-user-resolve-conflict', label: 'Ask user to resolve conflict' },
          ],
        },
      ),
    );
  }
  return diagnostics;
}

function validateCanvasAuthoringPromptFieldSuggestion(
  value: unknown,
  target: string,
  textLength: number | undefined,
  knownFieldIds: ReadonlySet<string>,
): readonly CanvasAuthoringDiagnostic[] {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (!isRecord(value)) {
    return [
      diagnostic('error', 'malformed-field-suggestion', 'Field suggestion must be an object.', {
        target,
        received: value,
      }),
    ];
  }
  const fieldId = value['fieldId'];
  if (!isNonEmptyString(fieldId)) {
    diagnostics.push(
      diagnostic('error', 'malformed-field-suggestion', 'Field suggestion fieldId is required.', {
        target: `${target}.fieldId`,
        received: fieldId,
      }),
    );
  } else if (knownFieldIds.size > 0 && !knownFieldIds.has(fieldId)) {
    diagnostics.push(
      diagnostic(
        'warning',
        'unknown-field-suggestion',
        'Field suggestion references an unknown Canvas field descriptor.',
        { target: `${target}.fieldId`, received: fieldId },
      ),
    );
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'suggestedValue')) {
    diagnostics.push(
      diagnostic(
        'error',
        'malformed-field-suggestion',
        'Field suggestion must include suggestedValue.',
        { target: `${target}.suggestedValue` },
      ),
    );
  }
  if (value['sourceRange'] !== undefined) {
    diagnostics.push(
      ...validateCanvasAuthoringSourceRange(
        value['sourceRange'],
        `${target}.sourceRange`,
        textLength,
      ),
    );
  }
  diagnostics.push(
    diagnostic(
      'info',
      'field-suggestion-requires-apply',
      'Prompt-derived field suggestions require explicit apply intent before changing Canvas fields.',
      {
        target,
        suggestedActions: [
          { id: 'apply-field-suggestion', label: 'Apply field suggestion', requiresApproval: true },
        ],
      },
    ),
  );
  return diagnostics;
}

function validateCanvasAuthoringSourceRange(
  value: unknown,
  target: string,
  textLength: number | undefined,
): readonly CanvasAuthoringDiagnostic[] {
  if (
    !isRecord(value) ||
    typeof value['start'] !== 'number' ||
    typeof value['end'] !== 'number' ||
    !Number.isInteger(value['start']) ||
    !Number.isInteger(value['end']) ||
    value['start'] < 0 ||
    value['end'] <= value['start'] ||
    (textLength !== undefined && value['end'] > textLength)
  ) {
    return [
      diagnostic('error', 'malformed-source-range', 'Prompt source range is invalid.', {
        target,
        received: value,
      }),
    ];
  }
  return [];
}

function collectCanvasAuthoringFieldIds(
  fieldProfiles: readonly CanvasAuthoringFieldProfileDescriptor[] | undefined,
): ReadonlySet<string> {
  return new Set(
    fieldProfiles?.flatMap((profile) => profile.fields.map((field) => field.id)) ?? [],
  );
}

function validateCanvasAuthoringPromptSpanDescriptor(
  value: unknown,
  fieldTarget: string,
): readonly CanvasAuthoringDiagnostic[] {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  const target = `${fieldTarget}.promptSpan`;
  if (!isRecord(value)) {
    return [
      diagnostic('error', 'malformed-prompt-span-descriptor', 'Prompt span must be an object.', {
        target,
        received: value,
      }),
    ];
  }
  if (!includesString(CANVAS_AUTHORING_PROMPT_SPAN_BEHAVIORS, value['behavior'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-prompt-span-behavior',
        'Prompt span behavior is unsupported.',
        {
          target: `${target}.behavior`,
          expected: CANVAS_AUTHORING_PROMPT_SPAN_BEHAVIORS,
          received: value['behavior'],
        },
      ),
    );
  }
  if (
    value['alignmentState'] !== undefined &&
    !includesString(CANVAS_AUTHORING_FIELD_PROFILE_ALIGNMENT_STATES, value['alignmentState'])
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-prompt-alignment-state',
        'Prompt-field alignment state is unsupported.',
        {
          target: `${target}.alignmentState`,
          expected: CANVAS_AUTHORING_FIELD_PROFILE_ALIGNMENT_STATES,
          received: value['alignmentState'],
        },
      ),
    );
  }
  if (!optionalString(value['spanKind']) || !optionalString(value['fieldId'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'malformed-prompt-span-descriptor',
        'Prompt span descriptor string fields are malformed.',
        { target, received: value },
      ),
    );
  }
  return diagnostics;
}

function validateCanvasAuthoringCapabilityBindingDescriptor(
  value: unknown,
  fieldTarget: string,
): readonly CanvasAuthoringDiagnostic[] {
  const target = `${fieldTarget}.capabilityBinding`;
  if (!isRecord(value) || !isNonEmptyString(value['capabilityId'])) {
    return [
      diagnostic(
        'error',
        'malformed-capability-binding',
        'Capability binding must declare a capabilityId.',
        { target, received: value },
      ),
    ];
  }
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (
    !optionalString(value['operationId']) ||
    !optionalString(value['inputField']) ||
    !optionalBoolean(value['requiresApproval']) ||
    !optionalBoolean(value['stableRefRequired'])
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'malformed-capability-binding',
        'Capability binding optional fields are malformed.',
        { target, received: value },
      ),
    );
  }
  const targetRefKinds = value['targetRefKinds'];
  if (
    targetRefKinds !== undefined &&
    (!Array.isArray(targetRefKinds) ||
      !targetRefKinds.every((kind) => includesString(CANVAS_AUTHORING_REF_KINDS, kind)))
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'malformed-capability-binding',
        'Capability binding targetRefKinds are malformed.',
        { target: `${target}.targetRefKinds`, received: targetRefKinds },
      ),
    );
  }
  return diagnostics;
}

export function isCanvasAuthoringCatalogSection(
  value: unknown,
): value is CanvasAuthoringCatalogSection {
  return includesString(CANVAS_AUTHORING_CATALOG_SECTIONS, value);
}

export function isCanvasAuthoringDiagnostic(value: unknown): value is CanvasAuthoringDiagnostic {
  if (!isRecord(value)) return false;
  return (
    (value['severity'] === 'info' ||
      value['severity'] === 'warning' ||
      value['severity'] === 'error') &&
    typeof value['code'] === 'string' &&
    value['code'].length > 0 &&
    typeof value['message'] === 'string' &&
    value['message'].length > 0 &&
    optionalString(value['target']) &&
    optionalBoolean(value['retryable']) &&
    optionalString(value['requiredQuery'])
  );
}

export function isCanvasAuthoringRef(value: unknown): value is CanvasAuthoringRef {
  if (!isRecord(value)) return false;
  return (
    includesString(CANVAS_AUTHORING_REF_KINDS, value['kind']) &&
    typeof value['id'] === 'string' &&
    value['id'].trim().length > 0 &&
    optionalString(value['canvasId']) &&
    optionalString(value['nodeId']) &&
    optionalString(value['connectionId']) &&
    optionalString(value['fieldPath']) &&
    optionalString(value['label'])
  );
}

export function isCanvasAuthoringOperationDescriptor(
  value: unknown,
): value is CanvasAuthoringOperationDescriptor {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    value['id'].trim().length > 0 &&
    includesString(CANVAS_AUTHORING_OPERATION_KINDS, value['kind']) &&
    includesString(CANVAS_AUTHORING_OPERATION_RISKS, value['risk']) &&
    includesString(CANVAS_AUTHORING_OPERATION_STATUSES, value['status']) &&
    optionalString(value['toolName']) &&
    optionalString(value['summary']) &&
    optionalBoolean(value['requiresConfirmation']) &&
    optionalStringArray(value['targetRequirements']) &&
    optionalStringArray(value['preferredQueryTools']) &&
    optionalString(value['unavailableReason'])
  );
}

export function isRuntimeOnlyCanvasAuthoringResourceIdentityValue(value: string): boolean {
  const trimmed = value.trim();
  return RUNTIME_RESOURCE_IDENTITY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function validationResult(
  diagnostics: readonly CanvasAuthoringDiagnostic[],
): CanvasAuthoringValidationResult {
  return {
    valid: diagnostics.every((item) => item.severity !== 'error'),
    diagnostics,
  };
}

function diagnostic(
  severity: CanvasAuthoringDiagnosticSeverity,
  code: string,
  message: string,
  details: Omit<CanvasAuthoringDiagnostic, 'severity' | 'code' | 'message'> = {},
): CanvasAuthoringDiagnostic {
  return { severity, code, message, ...details };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function optionalStringArray(value: unknown): boolean {
  return (
    value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}
