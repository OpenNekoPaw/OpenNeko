import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  qualityTargetsMatch,
  validateDurableResourceRef,
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
  type ResourceRef,
} from '@neko/shared';
import type {
  IAudioAnalyzer,
  IFrameExtractor,
  MediaQualityChatModelRef,
  MediaQualityLLMService,
} from './media-quality-runtime';
import type { IClipScorer } from './consistency-evaluator';

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
  readonly resourceRef: ResourceRef;
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
  readonly version: string;
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

export function rejectLegacyMediaPathRequest(value: unknown): never {
  if (isRecord(value) && ('mediaPath' in value || hasSceneMediaPath(value['scenes']))) {
    throw new Error(
      'legacy-path-target-rejected: Quality review requires QualityTarget.resourceRef or projectRef.',
    );
  }
  throw new Error('invalid-quality-target: Quality review requires a canonical QualityTarget.');
}

export function assertExternalPerceptionTarget(target: QualityTarget): ResourceRef {
  const validation = validateQualityTarget(target);
  if (!validation.ok) throw new Error(validation.diagnostics.map((item) => item.code).join(', '));
  if (
    target.kind === 'project-artifact' ||
    target.projectRef ||
    !target.resourceRef ||
    target.resourceRef.kind === 'document'
  ) {
    throw new Error(
      'invalid-quality-target: External perception cannot receive project archives or project paths; use an owning-package preview ResourceRef.',
    );
  }
  if (containsUnscopedLocalPath(target.resourceRef)) {
    throw new Error(
      'invalid-quality-target: External perception rejects arbitrary absolute local paths; materialize an authorized stable ResourceRef instead.',
    );
  }
  const durable = validateDurableResourceRef(target.resourceRef);
  if (!durable.ok) throw new Error(durable.diagnostics.map((item) => item.code).join(', '));
  return target.resourceRef;
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
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    gateResultId: input.gateResultId,
    target: input.target,
    policy: {
      policyId: input.policy.policyId,
      policyVersion: input.policy.policyVersion,
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
            requiresNewRevision: true,
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
        'Repair the blocking quality issues in the owning package and create a new revision.',
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

export interface QualityRepairExecutor {
  execute(input: {
    readonly action: QualityRepairAction;
    readonly sourceTarget: QualityTarget;
    readonly attempt: number;
  }): Promise<QualityTarget>;
}

export async function executeApprovedQualityRepair(input: {
  readonly approved: boolean;
  readonly maxAttempts: number;
  readonly gateResult: QualityGateResult;
  readonly executor: QualityRepairExecutor;
}): Promise<{
  readonly originalTarget: QualityTarget;
  readonly repairedTargets: readonly QualityTarget[];
}> {
  if (!input.approved)
    throw new Error('quality-repair-not-approved: Repair requires explicit approval.');
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 3) {
    throw new Error('quality-repair-limit-exceeded: maxAttempts must be between 1 and 3.');
  }
  const plan = input.gateResult.repairPlan;
  if (!plan) throw new Error('quality-repair-lineage-invalid: Failed Gate has no repair plan.');
  const repairedTargets: QualityTarget[] = [];
  let sourceTarget = input.gateResult.target;
  for (const action of plan.actions) {
    let repaired: QualityTarget | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= input.maxAttempts; attempt++) {
      try {
        repaired = await input.executor.execute({ action, sourceTarget, attempt });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!repaired) {
      throw new Error(
        `quality-repair-limit-exceeded: Repair failed after ${input.maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
    }
    if (qualityTargetsMatch(sourceTarget, repaired) || !hasSourceLineage(repaired, sourceTarget)) {
      throw new Error(
        'quality-repair-lineage-invalid: Repair must create a new lineage-bearing revision.',
      );
    }
    repairedTargets.push(repaired);
    sourceTarget = repaired;
  }
  return { originalTarget: input.gateResult.target, repairedTargets };
}

export function createTechnicalMediaEvaluator(deps: {
  readonly audioAnalyzer?: IAudioAnalyzer;
  readonly frameExtractor?: IFrameExtractor;
  readonly version?: string;
}): TechnicalEvaluator {
  return {
    evaluatorClass: 'technical',
    id: 'local-media-technical',
    version: deps.version ?? '1',
    supports: (profile) =>
      ['audio', 'video-clip', 'timeline-final-cut', 'deliverable'].includes(profile.id),
    evaluate: async (context) => {
      const materialized = await context.materializer.materialize({
        target: context.target,
        consumer: 'technical',
        representation: 'source',
      });
      try {
        if (!materialized.source)
          throw new Error('Technical materialization did not provide a source.');
        if (context.target.kind === 'audio') {
          if (!deps.audioAnalyzer) throw new Error('Audio analyzer is unavailable.');
          const [loudness, silence] = await Promise.all([
            deps.audioAnalyzer.analyzeLoudness(materialized.source),
            deps.audioAnalyzer.detectSilence(materialized.source),
          ]);
          const issues: QualityIssue[] = [];
          if (loudness.truePeakDbfs > -1)
            issues.push(
              issue(context, 'audio-clipping', 'error', 'Audio true peak exceeds -1 dBFS.'),
            );
          if (silence.silenceRatio > 0.5)
            issues.push(
              issue(context, 'excessive-silence', 'warning', 'Audio contains excessive silence.'),
            );
          return evidence(
            context,
            thisIdentity('local-media-technical', deps.version ?? '1', 'technical'),
            [
              metric('integrated-lufs', loudness.integratedLufs, 'LUFS'),
              metric('true-peak', loudness.truePeakDbfs, 'dBFS'),
              metric('silence-ratio', silence.silenceRatio),
            ],
            issues,
            { mode: 'complete' },
          );
        }
        const frameExtractor = deps.frameExtractor;
        if (!frameExtractor) throw new Error('Video probe is unavailable.');
        const source = materialized.source;
        const probe = await frameExtractor.probe(source);
        const issues: QualityIssue[] = [];
        if (probe.duration <= 0 || probe.width <= 0 || probe.height <= 0 || probe.fps <= 0) {
          issues.push(
            issue(
              context,
              'invalid-media-probe',
              'error',
              'Video probe returned invalid duration, dimensions, or fps.',
            ),
          );
        }
        const sampleTimes =
          probe.duration > 0 ? [0, probe.duration / 2, Math.max(0, probe.duration - 0.001)] : [0];
        const frames = await Promise.all(
          sampleTimes.map((time) => frameExtractor.extractFrame(source, time)),
        );
        if (frames.some((frame) => frame === null)) {
          issues.push(
            issue(
              context,
              'frame-decode-failure',
              'error',
              'One or more sampled frames could not be decoded.',
            ),
          );
        }
        return evidence(
          context,
          thisIdentity('local-media-technical', deps.version ?? '1', 'technical'),
          [
            metric('duration', probe.duration, 'seconds'),
            metric('width', probe.width, 'px'),
            metric('height', probe.height, 'px'),
            metric('fps', probe.fps, 'fps'),
            metric('decoded-frame-samples', frames.filter((frame) => frame !== null).length),
          ],
          issues,
          {
            mode: 'sampled',
            sampledFrames: sampleTimes.map((time) => Math.round(time * probe.fps)),
            sampleCount: sampleTimes.length,
          },
        );
      } finally {
        await materialized.release?.();
      }
    },
  };
}

export function createMultimodalPerceptionEvaluator(deps: {
  readonly createService: () => MediaQualityLLMService;
  readonly chatModel: MediaQualityChatModelRef;
  readonly evaluatorVersion?: string;
}): PerceptionEvaluator {
  return {
    evaluatorClass: 'perception',
    id: 'multimodal-media-perception',
    version: deps.evaluatorVersion ?? '1',
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
            version: deps.evaluatorVersion ?? '1',
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

export function createClipScreeningEvaluator(deps: {
  readonly scorer: IClipScorer;
  readonly modelId: string;
  readonly version?: string;
}): PerceptionEvaluator {
  return {
    evaluatorClass: 'perception',
    id: 'clip-consistency-screening',
    version: deps.version ?? '1',
    supports: (profile) => ['image', 'cross-shot-consistency'].includes(profile.id),
    evaluate: async (context) => {
      assertExternalPerceptionTarget(context.target);
      const materialized = await context.materializer.materialize({
        target: context.target,
        consumer: 'perception',
        representation: 'source',
      });
      try {
        if (!materialized.source) throw new Error('CLIP materialization did not provide a source.');
        const prompt =
          typeof context.target.expectedIntent?.['prompt'] === 'string'
            ? context.target.expectedIntent['prompt']
            : '';
        const score = await deps.scorer.score(materialized.source, prompt);
        return evidence(
          context,
          {
            id: 'clip-consistency-screening',
            version: deps.version ?? '1',
            evaluatorClass: 'perception',
            providerId: 'local',
            modelId: deps.modelId,
          },
          [metric('clip-alignment', score, 'score')],
          [],
          {
            mode: 'sampled',
            sampleCount: 1,
            description: 'CLIP screening evidence; not a complete Gate verdict.',
          },
          Math.max(0, Math.min(1, score / 100)),
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
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    evidenceId: context.createId('evidence'),
    evaluator,
    target: context.target,
    state: 'current',
    metrics,
    issues,
    coverage,
    ...(confidence !== undefined ? { confidence } : {}),
    createdAt: context.now(),
    sourceEvidenceRefs: context.target.resourceRef ? [context.target.resourceRef] : [],
  };
}
function thisIdentity(
  id: string,
  version: string,
  evaluatorClass: QualityEvaluatorClass,
): QualityEvidence['evaluator'] {
  return { id, version, evaluatorClass };
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
function issue(
  context: QualityEvaluationContext,
  category: string,
  severity: QualityIssue['severity'],
  message: string,
): QualityIssue {
  return { id: context.createId('issue'), category, severity, message };
}
function createEvaluatorFailureEvidence(
  evaluator: QualityEvaluator,
  target: QualityTarget,
  createdAt: string,
  evidenceId: string,
  error: unknown,
): QualityEvidence {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    evidenceId,
    evaluator: {
      id: evaluator.id,
      version: evaluator.version,
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
    sourceEvidenceRefs: target.resourceRef ? [target.resourceRef] : [],
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
function hasSourceLineage(target: QualityTarget, source: QualityTarget): boolean {
  return (
    target.lineage?.some(
      (item) =>
        item.revision === (source.revision ?? source.projectRef?.projectRevision) &&
        (item.resourceRef?.id === source.resourceRef?.id ||
          item.projectRef?.documentUri === source.projectRef?.documentUri),
    ) === true
  );
}
function containsUnscopedLocalPath(resourceRef: ResourceRef): boolean {
  const values = [
    resourceRef.source.filePath,
    resourceRef.locator?.kind === 'file' ? resourceRef.locator.path : undefined,
  ];
  return values.some(
    (value) =>
      typeof value === 'string' &&
      (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) &&
      !value.startsWith('${'),
  );
}

function hasSceneMediaPath(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => isRecord(item) && 'mediaPath' in item);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
