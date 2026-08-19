import { type ContentLocator } from '@neko/content';
import {
  qualityTargetsMatch,
  validateQualityEvidence,
  validateQualityTarget,
  type QualityCoverage,
  type QualityDiagnostic,
  type QualityEvaluatorClass,
  type QualityEvidence,
  type QualityGateIssue as QualityIssue,
  type QualityGatePolicy,
  type QualityGateResult,
  type QualityMetric,
  type QualityRepairAction,
  type QualityTarget,
  type QualityTargetKind,
} from '@neko/generation';

export interface MediaQualityLLMService {
  chat(
    messages: unknown[],
    options?: { maxTokens?: number; providerId?: string; modelId?: string },
  ): Promise<{ message: { content: string | unknown[] } }>;
}

export interface MediaQualityChatModelRef {
  readonly providerId: string;
  readonly modelId: string;
}

export const QUALITY_PROFILE_IDS = [
  'image',
  'video-clip',
  'audio',
  'storyboard',
  'cross-shot-consistency',
  'timeline-final-cut',
  'project-artifact',
  'deliverable',
] as const;

export type QualityProfileId = (typeof QUALITY_PROFILE_IDS)[number];
export type QualityMaterializationConsumer = 'technical' | 'perception' | 'repair';
export type QualityMaterializationRepresentation = 'source' | 'base64';

export interface QualityProfile {
  readonly id: QualityProfileId;
  readonly targetKind: QualityTargetKind;
  readonly evaluatorClasses: readonly QualityEvaluatorClass[];
}

export interface MaterializedQualityResource {
  readonly contentLocator: ContentLocator;
  readonly source?: string;
  readonly base64?: string;
  readonly mimeType?: string;
  release?(): Promise<void> | void;
}

export interface QualityTargetMaterializer {
  materialize(input: {
    readonly target: QualityTarget;
    readonly consumer: QualityMaterializationConsumer;
    readonly representation: QualityMaterializationRepresentation;
  }): Promise<MaterializedQualityResource>;
}

export interface QualityEvaluationContext {
  readonly target: QualityTarget;
  readonly profile: QualityProfile;
  readonly materializer: QualityTargetMaterializer;
  readonly now: () => string;
  readonly createId: (prefix: string) => string;
}

export interface QualityEvaluator {
  readonly evaluatorClass: QualityEvaluatorClass;
  readonly id: string;
  supports(profile: QualityProfile): boolean;
  evaluate(context: QualityEvaluationContext): Promise<QualityEvidence>;
}

export type StructuralEvaluator = QualityEvaluator & { readonly evaluatorClass: 'structural' };
export type TechnicalEvaluator = QualityEvaluator & { readonly evaluatorClass: 'technical' };
export type PerceptionEvaluator = QualityEvaluator & { readonly evaluatorClass: 'perception' };
export type PolicyEvaluator = QualityEvaluator & { readonly evaluatorClass: 'policy' };

const PROFILES: Readonly<Record<QualityProfileId, QualityProfile>> = {
  image: {
    id: 'image',
    targetKind: 'image',
    evaluatorClasses: ['structural', 'technical', 'perception', 'policy'],
  },
  'video-clip': {
    id: 'video-clip',
    targetKind: 'video-clip',
    evaluatorClasses: ['structural', 'technical', 'perception', 'policy'],
  },
  audio: {
    id: 'audio',
    targetKind: 'audio',
    evaluatorClasses: ['structural', 'technical', 'policy'],
  },
  storyboard: {
    id: 'storyboard',
    targetKind: 'storyboard',
    evaluatorClasses: ['structural', 'perception', 'policy'],
  },
  'cross-shot-consistency': {
    id: 'cross-shot-consistency',
    targetKind: 'cross-shot-consistency',
    evaluatorClasses: ['structural', 'perception', 'policy'],
  },
  'timeline-final-cut': {
    id: 'timeline-final-cut',
    targetKind: 'timeline-final-cut',
    evaluatorClasses: ['structural', 'technical', 'perception', 'policy'],
  },
  'project-artifact': {
    id: 'project-artifact',
    targetKind: 'project-artifact',
    evaluatorClasses: ['structural', 'technical', 'policy'],
  },
  deliverable: {
    id: 'deliverable',
    targetKind: 'exported-deliverable',
    evaluatorClasses: ['structural', 'technical', 'perception', 'policy'],
  },
};

const PROFILE_BY_KIND: Readonly<Record<QualityTargetKind, QualityProfileId>> = {
  image: 'image',
  'video-clip': 'video-clip',
  audio: 'audio',
  storyboard: 'storyboard',
  'cross-shot-consistency': 'cross-shot-consistency',
  'timeline-final-cut': 'timeline-final-cut',
  'project-artifact': 'project-artifact',
  'exported-deliverable': 'deliverable',
};

export function selectQualityProfile(
  target: QualityTarget,
  requested?: QualityProfileId,
): QualityProfile {
  const profile = PROFILES[requested ?? PROFILE_BY_KIND[target.kind]];
  if (profile.targetKind !== target.kind) {
    throw new Error(`Quality profile ${profile.id} does not accept target kind ${target.kind}.`);
  }
  return profile;
}

export function assertExternalPerceptionTarget(target: QualityTarget): ContentLocator {
  const validation = validateQualityTarget(target);
  if (!validation.ok) throw new Error(validation.diagnostics.map((item) => item.code).join(', '));
  if (
    target.kind === 'project-artifact' ||
    target.projectRef ||
    !target.contentLocator ||
    target.contentLocator.selector !== undefined
  ) {
    throw new Error(
      'invalid-quality-target: External perception cannot receive project archives or project paths; use an owning-package ContentLocator.',
    );
  }
  return target.contentLocator;
}

export interface QualityGateRuntimeDeps {
  readonly materializer: QualityTargetMaterializer;
  readonly evaluators: readonly QualityEvaluator[];
  readonly now?: () => string;
  readonly createId?: (prefix: string) => string;
}

export interface QualityReviewRequest {
  readonly target: QualityTarget;
  readonly policy: QualityGatePolicy;
  readonly profileId?: QualityProfileId;
  readonly existingEvidence?: readonly QualityEvidence[];
}

export class QualityGateRuntime {
  private readonly now: () => string;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: QualityGateRuntimeDeps) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.createId = deps.createId ?? ((prefix) => `${prefix}-${crypto.randomUUID()}`);
  }

  async review(request: QualityReviewRequest): Promise<QualityGateResult> {
    const targetValidation = validateQualityTarget(request.target);
    if (!targetValidation.ok)
      throw new Error(targetValidation.diagnostics.map((item) => item.code).join(', '));
    const profile = selectQualityProfile(request.target, request.profileId);
    const evidence = [...(request.existingEvidence ?? [])];
    const evaluatorClasses = new Set(profile.evaluatorClasses);

    for (const evaluator of this.deps.evaluators) {
      if (!evaluatorClasses.has(evaluator.evaluatorClass) || !evaluator.supports(profile)) continue;
      try {
        evidence.push(
          await evaluator.evaluate({
            target: request.target,
            profile,
            materializer: this.deps.materializer,
            now: this.now,
            createId: this.createId,
          }),
        );
      } catch (error) {
        evidence.push(
          createEvaluatorFailureEvidence(
            evaluator,
            request.target,
            this.now(),
            this.createId('evidence'),
            error,
          ),
        );
      }
    }

    return aggregateQualityGate({
      target: request.target,
      profile,
      policy: request.policy,
      evidence,
      now: this.now(),
      gateResultId: this.createId('gate'),
    });
  }
}

export function createQualityGateRuntime(deps: QualityGateRuntimeDeps): QualityGateRuntime {
  return new QualityGateRuntime(deps);
}

export function aggregateQualityGate(input: {
  readonly target: QualityTarget;
  readonly profile: QualityProfile;
  readonly policy: QualityGatePolicy;
  readonly evidence: readonly QualityEvidence[];
  readonly now: string;
  readonly gateResultId: string;
}): QualityGateResult {
  const diagnostics: QualityDiagnostic[] = [];
  const currentEvidence: QualityEvidence[] = [];
  const staleEvidenceIds: string[] = [];

  for (const evidence of input.evidence) {
    const validation = validateQualityEvidence(evidence, input.target);
    if (!qualityTargetsMatch(evidence.target, input.target) || evidence.state === 'stale') {
      staleEvidenceIds.push(evidence.evidenceId);
      diagnostics.push({
        code: 'stale-quality-evidence',
        severity: 'error',
        message: `Evidence ${evidence.evidenceId} is stale.`,
      });
      continue;
    }
    if (!validation.ok) {
      diagnostics.push(...validation.diagnostics);
      continue;
    }
    currentEvidence.push(evidence);
  }

  const presentClasses = new Set(currentEvidence.map((item) => item.evaluator.evaluatorClass));
  const requiredClasses = input.policy.requiredEvaluatorClasses.filter((item) =>
    input.profile.evaluatorClasses.includes(item),
  );
  const missingEvaluatorClasses = requiredClasses.filter((item) => !presentClasses.has(item));
  for (const evaluatorClass of missingEvaluatorClasses) {
    diagnostics.push({
      code: 'missing-required-evaluator',
      severity: 'error',
      message: `Required ${evaluatorClass} evaluator evidence is missing.`,
    });
  }

  const blockingIssues = currentEvidence
    .flatMap((item) => item.issues)
    .filter((issue) => input.policy.blockingSeverities.includes(issue.severity));
  const minimumConfidence = input.policy.minimumConfidence;
  const lowConfidence =
    minimumConfidence !== undefined &&
    currentEvidence.some(
      (item) => item.confidence !== undefined && item.confidence < minimumConfidence,
    );
  const partialPerception = currentEvidence.some(
    (item) => item.evaluator.evaluatorClass === 'perception' && item.coverage.mode !== 'complete',
  );
  if (partialPerception)
    diagnostics.push({
      code: 'partial-quality-coverage',
      severity: 'warning',
      message: 'Perception evidence covers only sampled or bounded content.',
    });
  if (lowConfidence)
    diagnostics.push({
      code: 'quality-policy-manual-review',
      severity: 'warning',
      message: 'Evidence confidence is below policy threshold.',
    });

  const hardFailure =
    blockingIssues.length > 0 ||
    (input.policy.requireCurrentEvidence && staleEvidenceIds.length > 0);
  const needsManualReview =
    missingEvaluatorClasses.length > 0 || partialPerception || lowConfidence;
  let verdict: QualityGateResult['verdict'];
  if (hardFailure) verdict = 'fail';
  else if (needsManualReview) verdict = input.policy.allowManualReview ? 'manual-review' : 'fail';
  else verdict = 'pass';

  return {
    gateResultId: input.gateResultId,
    target: input.target,
    policy: {
      policyId: input.policy.policyId,
      requiredProfiles: input.policy.requiredProfiles,
    },
    verdict,
    evidenceIds: currentEvidence.map((item) => item.evidenceId),
    staleEvidenceIds,
    missingEvaluatorClasses,
    diagnostics,
    ...(verdict === 'fail' && blockingIssues.length > 0
      ? {
          repairPlan: {
            planId: `${input.gateResultId}-repair`,
            actions: createRepairActions(input.target, blockingIssues),
          },
        }
      : {}),
    createdAt: input.now,
  };
}

function createRepairActions(
  target: QualityTarget,
  issues: readonly QualityIssue[],
): readonly QualityRepairAction[] {
  return [
    {
      owner: ownerForTarget(target.kind),
      targetId: target.targetId,
      issueIds: issues.map((issue) => issue.id),
      instruction:
        'Repair the blocking quality issues in the owning package and re-evaluate the updated content.',
    },
  ];
}

function ownerForTarget(kind: QualityTargetKind): QualityRepairAction['owner'] {
  if (kind === 'storyboard') return 'storyboard';
  if (kind === 'image') return 'image';
  if (kind === 'video-clip') return 'video';
  if (kind === 'audio') return 'audio';
  if (kind === 'timeline-final-cut') return 'cut';
  if (kind === 'exported-deliverable') return 'export';
  return 'project';
}

export function createMultimodalPerceptionEvaluator(deps: {
  readonly createService: () => MediaQualityLLMService;
  readonly chatModel: MediaQualityChatModelRef;
}): PerceptionEvaluator {
  return {
    evaluatorClass: 'perception',
    id: 'multimodal-media-perception',
    supports: (profile) =>
      [
        'image',
        'video-clip',
        'storyboard',
        'cross-shot-consistency',
        'timeline-final-cut',
        'deliverable',
      ].includes(profile.id),
    evaluate: async (context) => {
      assertExternalPerceptionTarget(context.target);
      const materialized = await context.materializer.materialize({
        target: context.target,
        consumer: 'perception',
        representation: 'base64',
      });
      try {
        if (!materialized.base64 || !materialized.mimeType)
          throw new Error('Perception materialization requires base64 and mimeType.');
        const response = await deps.createService().chat(
          [
            {
              role: 'system',
              content:
                'Evaluate media quality. Return JSON with score 0-100 and issues [{category,severity,message}].',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: JSON.stringify(context.target.expectedIntent ?? {}) },
                {
                  type: 'image',
                  imageUrl: `data:${materialized.mimeType};base64,${materialized.base64}`,
                  detail: 'low',
                },
              ],
            },
          ],
          {
            maxTokens: 800,
            providerId: deps.chatModel.providerId,
            modelId: deps.chatModel.modelId,
          },
        );
        const parsed = parsePerceptionResponse(response.message.content);
        return evidence(
          context,
          {
            id: 'multimodal-media-perception',
            evaluatorClass: 'perception',
            providerId: deps.chatModel.providerId,
            modelId: deps.chatModel.modelId,
          },
          [metric('visual-score', parsed.score, 'score', 60, parsed.score >= 60)],
          parsed.issues,
          context.target.kind === 'image'
            ? { mode: 'complete' }
            : {
                mode: 'sampled',
                description: 'Provider reviewed authorized sampled visual content.',
              },
          parsed.score / 100,
        );
      } finally {
        await materialized.release?.();
      }
    },
  };
}

function evidence(
  context: QualityEvaluationContext,
  evaluator: QualityEvidence['evaluator'],
  metrics: readonly QualityMetric[],
  issues: readonly QualityIssue[],
  coverage: QualityCoverage,
  confidence?: number,
): QualityEvidence {
  return {
    evidenceId: context.createId('evidence'),
    evaluator,
    target: context.target,
    state: 'current',
    metrics,
    issues,
    coverage,
    ...(confidence !== undefined ? { confidence } : {}),
    createdAt: context.now(),
    sourceEvidenceLocators: context.target.contentLocator ? [context.target.contentLocator] : [],
  };
}
function metric(
  id: string,
  value: QualityMetric['value'],
  unit?: string,
  threshold?: QualityMetric['threshold'],
  passed?: boolean,
): QualityMetric {
  return {
    id,
    value,
    ...(unit ? { unit } : {}),
    ...(threshold !== undefined ? { threshold } : {}),
    ...(passed !== undefined ? { passed } : {}),
  };
}
function createEvaluatorFailureEvidence(
  evaluator: QualityEvaluator,
  target: QualityTarget,
  createdAt: string,
  evidenceId: string,
  error: unknown,
): QualityEvidence {
  return {
    evidenceId,
    evaluator: {
      id: evaluator.id,
      evaluatorClass: evaluator.evaluatorClass,
    },
    target,
    state: 'current',
    metrics: [],
    issues: [
      {
        id: `${evidenceId}-failure`,
        category: 'evaluator-failure',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      },
    ],
    coverage: {
      mode: 'structural-only',
      description: 'Evaluator failed before completing coverage.',
    },
    createdAt,
    sourceEvidenceLocators: target.contentLocator ? [target.contentLocator] : [],
  };
}
function parsePerceptionResponse(content: string | unknown[]): {
  score: number;
  issues: QualityIssue[];
} {
  const text =
    typeof content === 'string'
      ? content
      : content
          .map((item) => (isRecord(item) && typeof item['text'] === 'string' ? item['text'] : ''))
          .join('');
  try {
    const raw = JSON.parse(text.replace(/```(?:json)?|```/g, '').trim()) as Record<string, unknown>;
    const score = typeof raw['score'] === 'number' ? Math.max(0, Math.min(100, raw['score'])) : 0;
    const issues = Array.isArray(raw['issues'])
      ? raw['issues'].flatMap((item, index) => {
          if (
            !isRecord(item) ||
            typeof item['category'] !== 'string' ||
            typeof item['message'] !== 'string'
          )
            return [];
          const severity = ['info', 'warning', 'error', 'critical'].includes(
            String(item['severity']),
          )
            ? (item['severity'] as QualityIssue['severity'])
            : 'warning';
          return [
            {
              id: `perception-issue-${index}`,
              category: item['category'],
              severity,
              message: item['message'],
            },
          ];
        })
      : [];
    return { score, issues };
  } catch {
    return {
      score: 0,
      issues: [
        {
          id: 'perception-parse-failure',
          category: 'evaluator-failure',
          severity: 'error',
          message: 'Perception provider returned invalid JSON.',
        },
      ],
    };
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
