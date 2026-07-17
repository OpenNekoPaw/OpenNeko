import { describe, expect, it, vi } from 'vitest';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  TOOL_NAMES_QUALITY,
  PROJECT_QUALITY_CONTRACT_VERSION,
  createResourceRef,
  type AgentCapabilityContext,
  type ProjectQualityFacade,
  type ResourceRef,
} from '@neko/shared';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import { createQualityCapabilityProvider } from '../qualityCapabilityProvider';

const resourceRef: ResourceRef = {
  id: 'asset:image:cat',
  scope: 'project',
  provider: 'project',
  kind: 'media',
  source: { kind: 'file', projectRelativePath: 'neko/generated/image/cat.png' },
  fingerprint: { strategy: 'hash', value: 'sha256:cat-v1' },
};

const context: AgentCapabilityContext = { extensionContext: {} };

function contentAccessRuntime(
  loadProviderAsset: AgentContentAccessRuntime['loadProviderAsset'],
): AgentContentAccessRuntime {
  return {
    resolve: vi.fn(),
    resolveImageMetadata: vi.fn(),
    resolveDocumentContent: vi.fn(),
    loadProviderAsset,
    projectResource: vi.fn(),
  };
}

function target() {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    targetId: 'asset-cat',
    kind: 'image',
    resourceRef,
    revision: 'rev-1',
    contentDigest: 'sha256:cat-v1',
    expectedIntent: { prompt: 'A playful orange cat.' },
  };
}

describe('QualityCapabilityProvider', () => {
  it('routes image review through the configured image understanding model and stable ref materializer', async () => {
    const complete = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        score: 91,
        issues: [
          {
            category: 'composition',
            severity: 'warning',
            message: 'The subject is slightly centered.',
          },
        ],
      }),
      usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
    });
    const loadProviderAsset = vi.fn().mockResolvedValue({
      status: 'ready',
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      diagnostics: [],
    });
    const provider = createQualityCapabilityProvider({
      getContentAccessRuntime: () => contentAccessRuntime(loadProviderAsset),
      projectQualityFacadeResolver: { resolve: vi.fn().mockResolvedValue(undefined) },
    });
    const tool = provider
      .getTools(context)
      .find((candidate) => candidate.name === TOOL_NAMES_QUALITY.QUALITY_CHECK);

    const result = await tool?.execute(
      { target: target() },
      {
        purposeModel: {
          purpose: 'image.understand',
          providerId: 'google',
          modelId: 'gemini-image-review',
          complete,
        },
      },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        verdict: 'pass',
        target: { targetId: 'asset-cat', resourceRef },
        missingEvaluatorClasses: [],
      },
    });
    expect(loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'quality-review',
        source: resourceRef,
        preferredTarget: 'bytes',
      }),
    );
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 800,
        prompt: JSON.stringify(target().expectedIntent),
        images: [{ data: 'AQID', mimeType: 'image/png' }],
      }),
    );
  });

  it('returns manual-review instead of fabricating perception success when no model is configured', async () => {
    const provider = createQualityCapabilityProvider({
      getContentAccessRuntime: vi.fn(),
      projectQualityFacadeResolver: { resolve: vi.fn().mockResolvedValue(undefined) },
    });
    const tool = provider
      .getTools(context)
      .find((candidate) => candidate.name === TOOL_NAMES_QUALITY.QUALITY_CHECK);

    await expect(tool?.execute({ target: target() })).resolves.toMatchObject({
      success: true,
      data: {
        verdict: 'manual-review',
        missingEvaluatorClasses: ['perception'],
      },
    });
  });

  it('routes project targets through the owning facade without content materialization', async () => {
    const projectRef = {
      domain: 'model' as const,
      documentUri: 'file:///workspace/scene.nkm',
      projectRevision: 'nkm:scene-v1',
      contentDigest: 'scene-v1',
    };
    const projectTarget = {
      version: MEDIA_QUALITY_CONTRACT_VERSION,
      targetId: 'scene-project',
      kind: 'project-artifact' as const,
      projectRef,
      revision: projectRef.projectRevision,
      contentDigest: projectRef.contentDigest,
    };
    const snapshotRef = createResourceRef({
      scope: 'project',
      provider: 'neko-model',
      kind: 'document',
      source: { kind: 'document', uri: projectRef.documentUri, identity: { hash: 'scene-v1' } },
      locator: { kind: 'file', uri: projectRef.documentUri },
      fingerprint: { strategy: 'hash', value: 'scene-v1' },
    });
    const facade: ProjectQualityFacade = {
      validateProject: vi.fn(async (request) => ({
        version: PROJECT_QUALITY_CONTRACT_VERSION,
        requestId: request.requestId,
        operation: 'validate-project',
        ok: true,
        data: projectTarget,
        diagnostics: [],
      })),
      getProjectSnapshot: vi.fn(async (request) => ({
        version: PROJECT_QUALITY_CONTRACT_VERSION,
        requestId: request.requestId,
        operation: 'get-project-snapshot',
        ok: true,
        data: { project: projectRef, snapshotRef, createdAt: '2026-07-12T00:00:00.000Z' },
        diagnostics: [],
      })),
      renderPreview: vi.fn(),
      probeRuntime: vi.fn(async (request) => ({
        version: PROJECT_QUALITY_CONTRACT_VERSION,
        requestId: request.requestId,
        operation: 'probe-runtime',
        ok: true,
        data: { project: projectRef, available: true, diagnostics: [] },
        diagnostics: [],
      })),
      checkExportReadiness: vi.fn(async (request) => ({
        version: PROJECT_QUALITY_CONTRACT_VERSION,
        requestId: request.requestId,
        operation: 'check-export-readiness',
        ok: true,
        data: { project: projectRef, ready: true, requiredEvidenceIds: [], diagnostics: [] },
        diagnostics: [],
      })),
    };
    const loadProviderAsset = vi.fn();
    const resolve = vi.fn(async () => facade);
    const provider = createQualityCapabilityProvider({
      getContentAccessRuntime: () => contentAccessRuntime(loadProviderAsset),
      projectQualityFacadeResolver: { resolve },
    });
    const tool = provider
      .getTools(context)
      .find((candidate) => candidate.name === TOOL_NAMES_QUALITY.QUALITY_CHECK);

    await expect(tool?.execute({ target: projectTarget })).resolves.toMatchObject({
      success: true,
      data: { verdict: 'pass', missingEvaluatorClasses: [] },
    });
    expect(resolve).toHaveBeenCalledWith(projectRef);
    expect(loadProviderAsset).not.toHaveBeenCalled();
    expect(facade.validateProject).toHaveBeenCalledTimes(1);
  });

  it('never invokes content access for a path-only legacy request', async () => {
    const loadProviderAsset = vi.fn();
    const provider = createQualityCapabilityProvider({
      getContentAccessRuntime: () => contentAccessRuntime(loadProviderAsset),
      projectQualityFacadeResolver: { resolve: vi.fn().mockResolvedValue(undefined) },
    });
    const tool = provider
      .getTools(context)
      .find((candidate) => candidate.name === TOOL_NAMES_QUALITY.QUALITY_CHECK);

    await expect(tool?.execute({ target: target(), mediaPath: '/tmp/cat.png' })).rejects.toThrow(
      'legacy-path-target-rejected',
    );
    expect(loadProviderAsset).not.toHaveBeenCalled();
  });
});
