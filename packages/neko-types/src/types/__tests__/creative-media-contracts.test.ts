import { describe, expect, it } from 'vitest';
import type { ResourceRef } from '../resource-cache';
import {
  validateDurableResourceRef,
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
} from '../index';
import {
  validateProjectQualityPreview,
  validateProjectQualityResult,
  type ProjectQualityResult,
} from '../../project-authoring/project-quality';

function resourceRef(overrides: Partial<ResourceRef> = {}): ResourceRef {
  return {
    id: 'asset:image:hero',
    scope: 'project',
    provider: 'workspace',
    kind: 'media',
    source: {
      kind: 'file',
      projectRelativePath: 'assets/hero.png',
    },
    fingerprint: { strategy: 'hash', value: 'sha256:hero-v1' },
    ...overrides,
  };
}

function target(overrides: Partial<QualityTarget> = {}): QualityTarget {
  return {
    version: 1,
    targetId: 'quality-target:hero',
    kind: 'image',
    resourceRef: resourceRef(),
    revision: 'revision-1',
    contentDigest: 'sha256:hero-v1',
    ...overrides,
  };
}

describe('creative media shared contracts', () => {
  it('rejects cache, render, Webview, and preview resources as durable identity', () => {
    expect(
      validateDurableResourceRef(
        resourceRef({
          source: { kind: 'file', filePath: '/workspace/.neko/cache/render/hero.png' },
        }),
      ).diagnostics.map((item) => item.code),
    ).toContain('runtime-resource-identity');

    expect(
      validateDurableResourceRef(
        resourceRef({ source: { kind: 'file', uri: 'vscode-webview://panel/hero.png' } }),
      ).ok,
    ).toBe(false);

    expect(
      validateDurableResourceRef(
        resourceRef({
          kind: 'preview',
          source: { kind: 'preview-asset', previewAssetId: 'preview-1' },
        }),
      ).diagnostics.map((item) => item.code),
    ).toContain('preview-resource-identity');
  });

  it('fails visibly for unknown cross-family operations and unsupported declarations', () => {
    const request: CreativeMediaOperationRequest = {
      version: 1,
      requestId: 'request-1',
      mediaKind: 'image',
      operationId: 'transform',
      inputRefs: [resourceRef()],
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
      inputRefs: [],
      startFrameRef: resourceRef(),
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
      outputRefs: [],
      diagnostics: [],
    };
    expect(validateCreativeMediaOperationResult(result).diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-operation-result', path: ['outputRefs'] }),
    ]);
  });

  it('requires stable target identity and revision instead of a bare path', () => {
    const invalid = target({
      resourceRef: resourceRef({ source: { kind: 'file', filePath: '/tmp/cache/render.png' } }),
      revision: undefined,
      contentDigest: undefined,
    });
    expect(validateQualityTarget(invalid).diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['invalid-quality-target', 'runtime-resource-identity']),
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
      sourceEvidenceRefs: [],
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
    const invalidPreviewRef = resourceRef({
      id: 'preview:runtime',
      kind: 'preview',
      source: { kind: 'remote-url', uri: 'blob:runtime-preview' },
    });
    expect(
      validateProjectQualityPreview({
        project: {
          domain: 'model',
          documentUri: 'file:///workspace/scene.nkm',
          projectRevision: 'nkm:scene-v1',
        },
        previewRef: invalidPreviewRef,
        sessionRenderUri: 'file:///workspace/render.png',
        createdAt: '2026-07-12T00:00:00.000Z',
      }).diagnostics,
    ).toEqual([
      expect.objectContaining({ path: ['previewRef'] }),
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
