import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  TOOL_NAMES_QUALITY,
  createTool,
  isResourceRef,
  validateQualityTarget,
  type MediaTimeRange,
  type QualityEvaluatorClass,
  type QualityGatePolicy,
  type QualityIssueSeverity,
  type QualityLineageRef,
  type QualityProjectRef,
  type QualityTarget,
  type QualityTargetKind,
  type Tool,
  type ToolExecuteOptions,
  type ToolResult,
} from '@neko/shared';
import {
  QUALITY_PROFILE_IDS,
  rejectLegacyMediaPathRequest,
  type QualityProfileId,
  type QualityReviewRequest,
} from './quality-gate-runtime';

export interface CanonicalQualityCheckToolsDeps {
  review(request: QualityReviewRequest, options?: ToolExecuteOptions): Promise<unknown>;
}

export function createCanonicalQualityCheckTools(
  deps: CanonicalQualityCheckToolsDeps,
): readonly Tool[] {
  return [
    createTool({
      name: TOOL_NAMES_QUALITY.QUALITY_CHECK,
      description:
        'Run a revision-bound media quality Gate for a canonical QualityTarget. The target must use a stable ResourceRef or owning-project reference; path-only legacy requests are rejected.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'object',
            description:
              'Canonical revision-bound QualityTarget with exactly one stable resourceRef or projectRef.',
          },
          profileId: {
            type: 'string',
            enum: [...QUALITY_PROFILE_IDS],
            description: 'Optional quality profile. It must match the target kind.',
          },
          policy: {
            type: 'object',
            description:
              'Optional Gate policy. When omitted, a conservative review policy is derived from the target kind.',
          },
        },
        required: ['target'],
        additionalProperties: false,
      },
      category: 'analysis',
      safetyKind: 'read-only-query',
      isReadOnly: true,
      isConcurrencySafe: true,
      traits: {
        cost: 'moderate',
        reversible: true,
        locality: 'hybrid',
        impactLevel: 'none',
      },
      execute: async (args, options): Promise<ToolResult> => {
        if ('mediaPath' in args || 'scenes' in args) {
          rejectLegacyMediaPathRequest(args);
        }
        const target = parseQualityTarget(args['target']);
        const profileId = parseProfileId(args['profileId']);
        const policy = parseQualityGatePolicy(args['policy'], target.kind);
        return {
          success: true,
          data: await deps.review(
            {
              target,
              policy,
              ...(profileId ? { profileId } : {}),
            },
            options,
          ),
        };
      },
    }),
  ];
}

function parseQualityTarget(value: unknown): QualityTarget {
  if (!isRecord(value)) rejectLegacyMediaPathRequest(value);
  const version = value['version'];
  const targetId = readNonEmptyString(value['targetId']);
  const kind = readTargetKind(value['kind']);
  const resourceRef = parseResourceRef(value['resourceRef']);
  const projectRef = parseProjectRef(value['projectRef']);
  const revision = readNonEmptyString(value['revision']);
  const contentDigest = readNonEmptyString(value['contentDigest']);
  const mediaRange = parseMediaRange(value['mediaRange']);
  const expectedIntent = parseExpectedIntent(value['expectedIntent']);
  const lineage = parseLineage(value['lineage']);

  if (version !== MEDIA_QUALITY_CONTRACT_VERSION || !targetId || !kind) {
    throw new Error('invalid-quality-target: Unsupported version, kind, or empty target id.');
  }
  const target: QualityTarget = {
    version,
    targetId,
    kind,
    ...(resourceRef ? { resourceRef } : {}),
    ...(projectRef ? { projectRef } : {}),
    ...(revision ? { revision } : {}),
    ...(contentDigest ? { contentDigest } : {}),
    ...(mediaRange ? { mediaRange } : {}),
    ...(expectedIntent ? { expectedIntent } : {}),
    ...(lineage ? { lineage } : {}),
  };
  const validation = validateQualityTarget(target);
  if (!validation.ok) {
    throw new Error(validation.diagnostics.map((diagnostic) => diagnostic.code).join(', '));
  }
  return target;
}

function parseQualityGatePolicy(value: unknown, kind: QualityTargetKind): QualityGatePolicy {
  if (value === undefined) return defaultPolicy(kind);
  if (!isRecord(value)) throw new Error('invalid-quality-policy: Policy must be an object.');

  const version = value['version'];
  const policyId = readNonEmptyString(value['policyId']);
  const policyVersion = readNonEmptyString(value['policyVersion']);
  const requiredProfiles = readStringArray(value['requiredProfiles']);
  const requiredEvaluatorClasses = readEvaluatorClasses(value['requiredEvaluatorClasses']);
  const blockingSeverities = readIssueSeverities(value['blockingSeverities']);
  const minimumConfidence = readProbability(value['minimumConfidence']);
  const allowManualReview = value['allowManualReview'];
  const allowManualOverride = value['allowManualOverride'];
  const requireCurrentEvidence = value['requireCurrentEvidence'];

  if (
    version !== MEDIA_QUALITY_CONTRACT_VERSION ||
    !policyId ||
    !policyVersion ||
    !requiredProfiles ||
    !requiredEvaluatorClasses ||
    !blockingSeverities ||
    typeof allowManualReview !== 'boolean' ||
    typeof requireCurrentEvidence !== 'boolean' ||
    (allowManualOverride !== undefined && typeof allowManualOverride !== 'boolean') ||
    (value['minimumConfidence'] !== undefined && minimumConfidence === undefined)
  ) {
    throw new Error('invalid-quality-policy: Policy fields are missing or invalid.');
  }

  return {
    version,
    policyId,
    policyVersion,
    requiredProfiles,
    requiredEvaluatorClasses,
    blockingSeverities,
    ...(minimumConfidence !== undefined ? { minimumConfidence } : {}),
    allowManualReview,
    ...(typeof allowManualOverride === 'boolean' ? { allowManualOverride } : {}),
    requireCurrentEvidence,
  };
}

function defaultPolicy(kind: QualityTargetKind): QualityGatePolicy {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    policyId: `media-quality-review/${kind}`,
    policyVersion: '1',
    requiredProfiles: [],
    requiredEvaluatorClasses: defaultEvaluatorClasses(kind),
    blockingSeverities: ['error', 'critical'],
    minimumConfidence: 0.6,
    allowManualReview: true,
    requireCurrentEvidence: true,
  };
}

function defaultEvaluatorClasses(kind: QualityTargetKind): readonly QualityEvaluatorClass[] {
  if (kind === 'audio' || kind === 'project-artifact') return ['technical'];
  if (kind === 'image' || kind === 'storyboard' || kind === 'cross-shot-consistency') {
    return ['perception'];
  }
  return ['technical', 'perception'];
}

function parseResourceRef(value: unknown): QualityTarget['resourceRef'] | undefined {
  if (value === undefined) return undefined;
  if (!isResourceRef(value)) {
    throw new Error('invalid-quality-target: resourceRef is malformed.');
  }
  return value;
}

function parseProjectRef(value: unknown): QualityProjectRef | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error('invalid-quality-target: projectRef must be an object.');
  }
  const domain = value['domain'];
  const documentUri = readNonEmptyString(value['documentUri']);
  const projectRevision = readNonEmptyString(value['projectRevision']);
  const contentDigest = readOptionalNonEmptyString(
    value['contentDigest'],
    'projectRef.contentDigest',
  );
  if (!isProjectDomain(domain) || !documentUri || !projectRevision) {
    throw new Error('invalid-quality-target: projectRef fields are missing or invalid.');
  }
  return {
    domain,
    documentUri,
    projectRevision,
    ...(contentDigest ? { contentDigest } : {}),
  };
}

function parseLineage(value: unknown): readonly QualityLineageRef[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error('invalid-quality-target: lineage must be an array.');
  }
  const lineage: QualityLineageRef[] = [];
  for (const item of value) {
    if (!isRecord(item) || !isLineageRelation(item['relation'])) {
      throw new Error('invalid-quality-target: lineage entry is malformed.');
    }
    const resourceRef = parseResourceRef(item['resourceRef']);
    const projectRef = parseProjectRef(item['projectRef']);
    const revision = readOptionalNonEmptyString(item['revision'], 'lineage.revision');
    lineage.push({
      relation: item['relation'],
      ...(resourceRef ? { resourceRef } : {}),
      ...(projectRef ? { projectRef } : {}),
      ...(revision ? { revision } : {}),
    });
  }
  return lineage;
}

function parseMediaRange(value: unknown): MediaTimeRange | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error('invalid-quality-target: mediaRange must be an object.');
  }
  const startSeconds = value['startSeconds'];
  const endSeconds = value['endSeconds'];
  if (typeof startSeconds !== 'number' || typeof endSeconds !== 'number') {
    throw new Error('invalid-quality-target: mediaRange fields must be numbers.');
  }
  return { startSeconds, endSeconds };
}

function parseExpectedIntent(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error('invalid-quality-target: expectedIntent must be an object.');
  }
  return value;
}

function parseProfileId(value: unknown): QualityProfileId | undefined {
  if (value === undefined) return undefined;
  if (!isQualityProfileId(value)) {
    throw new Error('invalid-quality-profile: Unknown quality profile id.');
  }
  return value;
}

function isQualityProfileId(value: unknown): value is QualityProfileId {
  return (
    value === 'image' ||
    value === 'video-clip' ||
    value === 'audio' ||
    value === 'storyboard' ||
    value === 'cross-shot-consistency' ||
    value === 'timeline-final-cut' ||
    value === 'project-artifact' ||
    value === 'deliverable'
  );
}

function readTargetKind(value: unknown): QualityTargetKind | undefined {
  switch (value) {
    case 'image':
    case 'video-clip':
    case 'audio':
    case 'storyboard':
    case 'cross-shot-consistency':
    case 'timeline-final-cut':
    case 'project-artifact':
    case 'exported-deliverable':
      return value;
    default:
      return undefined;
  }
}

function readEvaluatorClasses(value: unknown): readonly QualityEvaluatorClass[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: QualityEvaluatorClass[] = [];
  for (const item of value) {
    const evaluatorClass = readEvaluatorClass(item);
    if (!evaluatorClass) return undefined;
    result.push(evaluatorClass);
  }
  return result;
}

function readEvaluatorClass(value: unknown): QualityEvaluatorClass | undefined {
  if (
    value === 'structural' ||
    value === 'technical' ||
    value === 'perception' ||
    value === 'policy'
  ) {
    return value;
  }
  return undefined;
}

function readIssueSeverities(value: unknown): readonly QualityIssueSeverity[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: QualityIssueSeverity[] = [];
  for (const item of value) {
    if (item !== 'info' && item !== 'warning' && item !== 'error' && item !== 'critical') {
      return undefined;
    }
    result.push(item);
  }
  return result;
}

function readStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const item of value) {
    const text = readNonEmptyString(item);
    if (!text) return undefined;
    result.push(text);
  }
  return result;
}

function readProbability(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalNonEmptyString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  const parsed = readNonEmptyString(value);
  if (!parsed) {
    throw new Error(`invalid-quality-target: ${field} must be a non-empty string.`);
  }
  return parsed;
}

function isProjectDomain(value: unknown): value is QualityProjectRef['domain'] {
  return value === 'canvas' || value === 'cut' || value === 'audio';
}

function isLineageRelation(value: unknown): value is QualityLineageRef['relation'] {
  return (
    value === 'source' ||
    value === 'generated-from' ||
    value === 'derived-from' ||
    value === 'projected-from' ||
    value === 'exported-from' ||
    value === 'reference'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
