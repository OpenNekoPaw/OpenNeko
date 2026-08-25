import { describe, expect, it } from 'vitest';
import { validateContentLocator } from '@neko/content-domain';
import {
  validateCreativeMediaOperationDispatch,
  validateCreativeMediaOperationRequest,
  validateCreativeMediaOperationResult,
  validateCreativeMediaOperationSupport,
  validateQualityEvidence,
  validateQualityGateResult,
  validateQualityTarget,
  type CreativeMediaOperationRequest,
  type CreativeMediaOperationResult,
  type CreativeMediaOperationSupport,
  type QualityEvidence,
  type QualityGateResult,
  type QualityTarget,
} from '@neko/generation-domain';
import {
  validateProjectQualityPreview,
  validateProjectQualityResult,
  type ProjectQualityResult,
} from '../project';

function contentLocator(path = 'assets/hero.png') {
  return {
    file: { authority: 'workspace' as const, path },
  };
}

function target(overrides: Partial<QualityTarget> = {}): QualityTarget {
  return {
    targetId: 'quality-target:hero',
    kind: 'image',
    contentLocator: contentLocator(),
    contentDigest: 'sha256:hero-content',
    ...overrides,
  };
}

describe('creative media shared contracts', () => {
  it('rejects cache paths, absolute paths, and runtime URLs as ContentLocator identity', () => {
    expect(validateContentLocator(contentLocator('.cache/render/hero.png')).ok).toBe(false);
    expect(validateContentLocator(contentLocator('/workspace/assets/hero.png')).ok).toBe(false);
    expect(validateContentLocator(contentLocator('neko-media://panel/hero.png')).ok).toBe(false);
    expect(
      validateContentLocator(contentLocator('openneko://resource/0123456789abcdefghijklmnopqrstuv'))
        .ok,
    ).toBe(false);
  });

  it('fails visibly for unknown cross-family operations and unsupported declarations', () => {
    const request: CreativeMediaOperationRequest = {
      requestId: 'request-1',
      mediaKind: 'image',
      operationId: 'transform',
      inputLocators: [contentLocator()],
    };
    expect(validateCreativeMediaOperationRequest(request).diagnostics).toEqual([
      expect.objectContaining({ code: 'unknown-operation' }),
    ]);

    const support: CreativeMediaOperationSupport = {
      mediaKind: 'video',
      operationId: 'generate-from-keyframes',
      level: 'unsupported',
      adapterId: 'provider-without-end-frame',
      acceptedControls: ['start-frame'],
      diagnostics: [],
    };
    expect(validateCreativeMediaOperationSupport(support).diagnostics).toEqual([
      expect.objectContaining({ code: 'operation-unsupported' }),
    ]);
  });

  it('negotiates required inputs and limits before dispatch', () => {
    const request: CreativeMediaOperationRequest = {
      requestId: 'request-keyframes',
      mediaKind: 'video',
      operationId: 'generate-from-keyframes',
      inputLocators: [],
      startFrameLocator: contentLocator(),
      requestedDurationSeconds: 12,
    };
    const support: CreativeMediaOperationSupport = {
      mediaKind: 'video',
      operationId: 'generate-from-keyframes',
      level: 'supported',
      adapterId: 'keyframe-provider',
      acceptedControls: ['start-frame', 'end-frame', 'duration'],
      requirements: { requiredInputRoles: ['start-frame', 'end-frame'] },
      limits: { maxDurationSeconds: 8 },
      diagnostics: [],
    };
    expect(
      validateCreativeMediaOperationDispatch(request, support).diagnostics.map((item) => item.code),
    ).toEqual(expect.arrayContaining(['missing-required-input', 'operation-limit-exceeded']));
  });

  it('rejects malformed successful operation results', () => {
    const result: CreativeMediaOperationResult = {
      requestId: 'request-1',
      mediaKind: 'image',
      operationId: 'generate',
      status: 'succeeded',
      outputLocators: [],
      diagnostics: [],
    };
    expect(validateCreativeMediaOperationResult(result).diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-operation-result', path: ['outputLocators'] }),
    ]);
  });

  it('requires stable target identity and a content digest instead of a bare path', () => {
    const invalid = target({
      contentLocator: undefined,
      contentDigest: '',
    });
    expect(validateQualityTarget(invalid).diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['invalid-quality-target']),
    );
  });

  it('marks evidence stale when the target content digest changes', () => {
    const evidence: QualityEvidence = {
      evidenceId: 'evidence-1',
      evaluator: { id: 'visual-consistency', evaluatorClass: 'perception' },
      target: target(),
      state: 'current',
      metrics: [],
      issues: [],
      coverage: { mode: 'sampled', sampledFrames: [0, 12], sampleCount: 2 },
      confidence: 0.8,
      createdAt: '2026-07-11T00:00:00.000Z',
      sourceEvidenceLocators: [],
    };
    expect(
      validateQualityEvidence(evidence, target({ contentDigest: 'sha256:hero-changed' }))
        .diagnostics,
    ).toEqual([expect.objectContaining({ code: 'stale-quality-evidence' })]);
  });

  it('does not allow a passing gate with stale evidence or missing evaluators', () => {
    const result: QualityGateResult = {
      gateResultId: 'gate-1',
      target: target(),
      policy: { policyId: 'asset-gate', requiredProfiles: ['image'] },
      verdict: 'pass',
      evidenceIds: ['evidence-1'],
      staleEvidenceIds: ['evidence-0'],
      missingEvaluatorClasses: ['perception'],
      diagnostics: [],
      createdAt: '2026-07-11T00:00:00.000Z',
    };
    expect(validateQualityGateResult(result).diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-quality-gate-result' }),
    ]);
  });

  it('rejects unknown contract fields without silently accepting them', () => {
    const invalidTarget = target();
    Reflect.set(invalidTarget, 'unexpectedField', 99);
    expect(validateQualityTarget(invalidTarget).diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-quality-target' }),
    ]);
  });

  it('rejects runtime-only ProjectQuality preview identity and durable session URLs', () => {
    const invalidPreview = {
      project: {
        domain: 'cut' as const,
        documentUri: 'file:///workspace/edit.otio',
        contentDigest: 'sha256:edit-current',
      },
      sourceLocator: contentLocator(),
      sessionRenderUri: 'file:///workspace/render.png',
      createdAt: '2026-07-12T00:00:00.000Z',
    };
    Reflect.set(invalidPreview, 'sourceLocator', {
      kind: 'content-representation-handle',
      id: 'preview-1',
    });
    expect(validateProjectQualityPreview(invalidPreview).diagnostics).toEqual([
      expect.objectContaining({ path: ['sourceLocator'] }),
      expect.objectContaining({ path: ['sessionRenderUri'] }),
    ]);
  });

  it('rejects malformed ProjectQuality result envelopes', () => {
    const result: ProjectQualityResult<QualityTarget> = {
      requestId: 'project-quality-1',
      operation: 'validate-project',
      ok: true,
      diagnostics: [],
    };
    expect(validateProjectQualityResult(result).diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-quality-gate-result', path: ['data'] }),
    ]);
  });
});
