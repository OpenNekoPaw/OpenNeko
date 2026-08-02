import { describe, expect, it } from 'vitest';
import { validateContentLocator } from '@neko/content';
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
} from '@neko/generation';
import {
  validateProjectQualityPreview,
  validateProjectQualityResult,
  type ProjectQualityResult,
} from '../project';

function contentLocator(path = 'assets/hero.png') {
  return {
    kind: 'workspace-file' as const,
    path,
    fingerprint: { strategy: 'sha256' as const, value: 'sha256:hero-v1' },
  };
}

function target(overrides: Partial<QualityTarget> = {}): QualityTarget {
  return {
    version: 1,
    targetId: 'quality-target:hero',
    kind: 'image',
    contentLocator: contentLocator(),
    revision: 'revision-1',
    contentDigest: 'sha256:hero-v1',
    ...overrides,
  };
}

describe('creative media shared contracts', () => {
  it('rejects cache paths, absolute paths, and runtime URLs as ContentLocator identity', () => {
    expect(validateContentLocator(contentLocator('.neko/.cache/render/hero.png')).ok).toBe(false);
    expect(validateContentLocator(contentLocator('/workspace/assets/hero.png')).ok).toBe(false);
    expect(validateContentLocator(contentLocator('neko-media://panel/hero.png')).ok).toBe(false);
    expect(
      validateContentLocator(contentLocator('openneko://resource/0123456789abcdefghijklmnopqrstuv'))
        .ok,
    ).toBe(false);
  });

  it('fails visibly for unknown cross-family operations and unsupported declarations', () => {
    const request: CreativeMediaOperationRequest = {
      version: 1,
      requestId: 'request-1',
      mediaKind: 'image',
      operationId: 'transform',
      inputLocators: [contentLocator()],
    };
    expect(validateCreativeMediaOperationRequest(request).diagnostics).toEqual([
      expect.objectContaining({ code: 'unknown-operation' }),
    ]);

    const support: CreativeMediaOperationSupport = {
      version: 1,
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
      version: 1,
      requestId: 'request-keyframes',
      mediaKind: 'video',
      operationId: 'generate-from-keyframes',
      inputLocators: [],
      startFrameLocator: contentLocator(),
      requestedDurationSeconds: 12,
    };
    const support: CreativeMediaOperationSupport = {
      version: 1,
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
      version: 1,
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

  it('requires stable target identity and revision instead of a bare path', () => {
    const invalid = target({
      contentLocator: undefined,
      revision: undefined,
      contentDigest: undefined,
    });
    expect(validateQualityTarget(invalid).diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['invalid-quality-target']),
    );
  });

  it('marks evidence stale when target revision changes', () => {
    const evidence: QualityEvidence = {
      version: 1,
      evidenceId: 'evidence-1',
      evaluator: { id: 'visual-consistency', version: '1.0.0', evaluatorClass: 'perception' },
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
      validateQualityEvidence(
        evidence,
        target({ revision: 'revision-2', contentDigest: 'sha256:hero-v2' }),
      ).diagnostics,
    ).toEqual([expect.objectContaining({ code: 'stale-quality-evidence' })]);
  });

  it('does not allow a passing gate with stale evidence or missing evaluators', () => {
    const result: QualityGateResult = {
      version: 1,
      gateResultId: 'gate-1',
      target: target(),
      policy: { policyId: 'asset-gate', policyVersion: '1', requiredProfiles: ['image'] },
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

  it('rejects unknown contract versions without silently accepting them', () => {
    const unknownVersionTarget = target();
    Reflect.set(unknownVersionTarget, 'version', 99);
    expect(validateQualityTarget(unknownVersionTarget).diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-quality-target' }),
    ]);
  });

  it('rejects runtime-only ProjectQuality preview identity and durable session URLs', () => {
    const invalidPreview = {
      project: {
        domain: 'cut' as const,
        documentUri: 'file:///workspace/edit.otio',
        projectRevision: 'otio:edit-v1',
      },
      previewLocator: {
        kind: 'content-representation' as const,
        id: 'preview-1',
        representationKind: 'preview' as const,
        source: contentLocator(),
        spec: { kind: 'preview' as const },
        generatorId: 'cut-preview',
        sourceFingerprint: 'source-v1',
        specFingerprint: 'preview-v1',
        revision: '1',
      },
      sessionRenderUri: 'file:///workspace/render.png',
      createdAt: '2026-07-12T00:00:00.000Z',
    };
    Reflect.set(invalidPreview, 'previewLocator', {
      kind: 'content-representation',
      source: { kind: 'runtime', value: 'blob:runtime-preview' },
    });
    expect(validateProjectQualityPreview(invalidPreview).diagnostics).toEqual([
      expect.objectContaining({ path: ['previewLocator'] }),
      expect.objectContaining({ path: ['sessionRenderUri'] }),
    ]);
  });

  it('rejects malformed ProjectQuality result envelopes', () => {
    const result: ProjectQualityResult<QualityTarget> = {
      version: 1,
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
