import { describe, expect, it } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_PATH,
  createGeneratedAssetsWorkspaceDeliveryRequest,
  resolveCanvasWorkspaceBoardDocumentUri,
  validateCanvasWorkspaceProjectionRequest,
  validateCanvasWorkspaceProjectionResult,
  type CanvasWorkspaceProjectionArtifact,
  type CanvasWorkspaceMarkdownProjectionArtifact,
  type CanvasWorkspaceResourceProjectionArtifact,
  type CanvasWorkspaceProjectionRequest,
} from '../canvas-workspace-board';
import type { GeneratedImage } from '@neko/generation';
import { createGeneratedAssetRevisionRef } from '@neko/generation';
import type { GeneratedOutputContentLocator } from '@neko/content';

const generatedLocator: GeneratedOutputContentLocator = {
  kind: 'generated-output',
  outputId: 'shot-1',
  digest: 'sha256:shot-1',
  path: 'neko/generated/image/shot-1.png',
};
const sourceLocator = {
  kind: 'workspace-file' as const,
  path: 'neko/assets/references/source-image.png',
  fingerprint: { strategy: 'sha256' as const, value: 'sha256:source-image' },
};

describe('Canvas Workspace Board delivery contract', () => {
  it('derives one canonical Workspace Board URI', () => {
    expect(CANVAS_WORKSPACE_BOARD_PATH).toBe('neko/boards/workspace.nkc');
    expect(resolveCanvasWorkspaceBoardDocumentUri('file:///workspace/project/')).toBe(
      'file:///workspace/project/neko/boards/workspace.nkc',
    );
  });

  it('accepts source, analysis, output, and explicit ordinary Canvas batches', () => {
    expect(validateCanvasWorkspaceProjectionRequest(request())).toEqual([]);
    expect(
      validateCanvasWorkspaceProjectionRequest(
        request({ documentUri: 'file:///workspace/project/design/concept.nkc' }),
      ),
    ).toEqual([]);
  });

  it('rejects the whole batch for invalid targets or one invalid child', () => {
    const missingWorkspace = request({ workspaceId: '' });
    const invalidChild = request({
      artifacts: [
        ...request().artifacts,
        {
          ...markdownArtifact(),
          provenance: { ...markdownArtifact().provenance, artifactId: '' },
        },
      ],
    });

    expect(
      validateCanvasWorkspaceProjectionRequest(missingWorkspace).map(({ code }) => code),
    ).toContain('workspace-required');
    expect(
      validateCanvasWorkspaceProjectionRequest(invalidChild).map(({ code }) => code),
    ).toContain('missing-projection-identity');
  });

  it('rejects duplicate identities and mismatched kinds', () => {
    const duplicate = request({ artifacts: [markdownArtifact(), markdownArtifact()] });
    const mismatch = request({
      artifacts: [
        {
          ...markdownArtifact(),
          provenance: { ...markdownArtifact().provenance, kind: 'image' },
        },
      ],
    });

    expect(validateCanvasWorkspaceProjectionRequest(duplicate).map(({ code }) => code)).toContain(
      'duplicate-artifact-identity',
    );
    expect(validateCanvasWorkspaceProjectionRequest(mismatch).map(({ code }) => code)).toContain(
      'unsupported-projection-kind',
    );
  });

  it('accepts portable intrinsic image dimensions and rejects malformed dimensions', () => {
    expect(
      validateCanvasWorkspaceProjectionRequest(
        request({
          artifacts: [{ ...outputArtifact(), intrinsicDimensions: { width: 1024, height: 1536 } }],
        }),
      ),
    ).toEqual([]);
    expect(
      validateCanvasWorkspaceProjectionRequest(
        request({
          artifacts: [
            {
              ...outputArtifact(),
              intrinsicDimensions: { width: 1024, height: 0 },
            },
          ],
        }),
      ).map(({ code }) => code),
    ).toContain('runtime-value-forbidden');
  });

  it('rejects unresolved, self-referencing, and duplicate creative-content relations', () => {
    const unresolved = request({
      artifacts: [
        sourceArtifact(),
        {
          ...markdownArtifact(),
          provenance: {
            ...markdownArtifact().provenance,
            sourceArtifactIds: ['missing-source'],
          },
        },
      ],
    });
    const selfReferencing = request({
      artifacts: [
        {
          ...markdownArtifact(),
          provenance: {
            ...markdownArtifact().provenance,
            sourceArtifactIds: ['analysis-1'],
          },
        },
      ],
    });
    const duplicate = request({
      artifacts: [
        sourceArtifact(),
        {
          ...markdownArtifact(),
          provenance: {
            ...markdownArtifact().provenance,
            sourceArtifactIds: ['source-1', 'source-1'],
          },
        },
      ],
    });
    const duplicateArtifactId = request({
      artifacts: [
        sourceArtifact(),
        {
          ...sourceArtifact(),
          provenance: {
            ...sourceArtifact().provenance,
            contentFingerprint: 'sha256:shot-2',
          },
        },
      ],
    });
    const cyclic = request({
      artifacts: [
        {
          ...sourceArtifact(),
          provenance: {
            ...sourceArtifact().provenance,
            sourceArtifactIds: ['analysis-1'],
          },
        },
        {
          ...markdownArtifact(),
          provenance: {
            ...markdownArtifact().provenance,
            sourceArtifactIds: ['source-1'],
          },
        },
      ],
    });

    for (const invalid of [unresolved, selfReferencing, duplicate, duplicateArtifactId, cyclic]) {
      expect(validateCanvasWorkspaceProjectionRequest(invalid).map(({ code }) => code)).toContain(
        'invalid-artifact-relation',
      );
    }
  });

  it('keeps stable idempotency identity without active or recent routing state', () => {
    const first = request();
    const second = request();

    expect(first.process.deliveryId).toBe(second.process.deliveryId);
    expect(first.artifacts.map(({ provenance }) => provenance.contentFingerprint)).toEqual(
      second.artifacts.map(({ provenance }) => provenance.contentFingerprint),
    );
    expect(JSON.stringify(first)).not.toMatch(/activeCanvas|recentCanvas|conversationId|binding/iu);
  });

  it('creates one generated batch with portable generation provenance', () => {
    const delivery = createGeneratedAssetsWorkspaceDeliveryRequest([generatedImage()], {
      workspaceId: 'workspace-1',
      workspaceUri: 'file:///workspace/project/',
      sourceHost: 'desktop',
      jobRef: { kind: 'generation', jobId: 'operation-1' },
    });

    expect(delivery).toMatchObject({
      target: { workspaceId: 'workspace-1', workspaceUri: 'file:///workspace/project/' },
      process: { sourceHost: 'desktop', operationId: 'operation-1', runId: 'run-1' },
      artifacts: [
        {
          kind: 'image',
          contentLocator: expect.objectContaining({
            kind: 'generated-output',
            outputId: 'shot-1',
          }),
          generation: {
            jobRef: { kind: 'generation', jobId: 'operation-1' },
            summary: {
              prompt: 'A silent megastructure under hard light',
              model: 'image-model',
              sourceNodeId: 'shot-node-1',
              aspectRatio: '16:9',
              width: 2048,
              height: 1152,
            },
          },
          provenance: { role: 'output', artifactId: 'shot-1' },
        },
      ],
    });
    expect(validateCanvasWorkspaceProjectionRequest(delivery)).toEqual([]);
    expect(JSON.stringify(delivery)).not.toContain('/workspace/project/neko/generated');
  });

  it('requires Generation Job evidence only for generated outputs', () => {
    const generatedWithoutEvidence = request({
      artifacts: [{ ...outputArtifact(), generation: undefined }],
    });
    const referencedWithEvidence = request({
      artifacts: [
        {
          ...sourceArtifact(),
          generation: outputArtifact().generation,
        },
      ],
    });

    expect(
      validateCanvasWorkspaceProjectionRequest(generatedWithoutEvidence).map(({ code }) => code),
    ).toContain('missing-projection-identity');
    expect(
      validateCanvasWorkspaceProjectionRequest(referencedWithEvidence).map(({ code }) => code),
    ).toContain('invalid-content-locator');
  });

  it('rejects runtime handles, cache values, and malformed refs', () => {
    const invalid = {
      ...request(),
      token: 'secret',
      renderUri: 'neko-media://preview/shot-1',
      cachePath: '.neko/.cache/generated/shot-1.png',
    } as unknown as CanvasWorkspaceProjectionRequest;
    const invalidRef = request({
      artifacts: [
        {
          ...outputArtifact(),
          resourceRef: { kind: 'generated' },
        },
      ],
    } as never);

    const invalidCodes = validateCanvasWorkspaceProjectionRequest(invalid).map(({ code }) => code);
    expect(invalidCodes.filter((code) => code === 'runtime-value-forbidden')).toHaveLength(3);
    expect(validateCanvasWorkspaceProjectionRequest(invalidRef).map(({ code }) => code)).toContain(
      'invalid-content-locator',
    );
  });

  it('keeps blocked and conflict results target-free', () => {
    for (const status of ['blocked', 'conflict'] as const) {
      expect(
        validateCanvasWorkspaceProjectionResult({
          status,
          target: {
            kind: 'workspace',
            documentUri: 'file:///workspace/project/neko/boards/workspace.nkc',
          },
          diagnostics: [],
        }).map(({ code }) => code),
      ).toContain('invalid-canvas-target');
    }
  });
});

function request(
  input: {
    readonly workspaceId?: string;
    readonly documentUri?: string;
    readonly artifacts?: readonly CanvasWorkspaceProjectionArtifact[];
  } = {},
): CanvasWorkspaceProjectionRequest {
  return {
    target: {
      workspaceId: input.workspaceId ?? 'workspace-1',
      workspaceUri: 'file:///workspace/project/',
      ...(input.documentUri ? { documentUri: input.documentUri } : {}),
    },
    process: {
      deliveryId: 'delivery:material-analysis:1',
      sourceHost: 'desktop',
      taskId: 'task-1',
      runId: 'run-1',
      createdAt: '2026-07-15T00:00:00.000Z',
    },
    artifacts: input.artifacts ?? [sourceArtifact(), markdownArtifact(), outputArtifact()],
  };
}

function sourceArtifact(): CanvasWorkspaceResourceProjectionArtifact {
  return {
    kind: 'file-reference',
    title: 'Source image',
    contentLocator: sourceLocator,
    provenance: provenance('source-1', 'source:sha256:shot-1', 'file-reference', 'source'),
  };
}

function markdownArtifact(): CanvasWorkspaceMarkdownProjectionArtifact {
  return {
    kind: 'markdown',
    title: 'Material Analysis',
    markdown: '# Material Analysis\n\nReviewable findings.',
    provenance: provenance('analysis-1', 'markdown:sha256:analysis-1', 'markdown', 'analysis'),
  };
}

function outputArtifact(): CanvasWorkspaceResourceProjectionArtifact {
  return {
    kind: 'image',
    title: 'Shot 1',
    mimeType: 'image/png',
    contentLocator: generatedLocator,
    generation: {
      jobRef: { kind: 'generation', jobId: 'operation-1' },
      summary: {
        prompt: 'A silent megastructure under hard light',
        model: 'image-model',
        sourceNodeId: 'shot-node-1',
        aspectRatio: '16:9',
      },
    },
    provenance: provenance('shot-1', 'generated:sha256:shot-1', 'image', 'output'),
  };
}

function provenance(
  artifactId: string,
  contentFingerprint: string,
  kind: CanvasWorkspaceProjectionArtifact['kind'],
  role: 'source' | 'analysis' | 'output',
) {
  return {
    deliveryId: 'delivery:material-analysis:1',
    artifactId,
    contentFingerprint,
    kind,
    role,
    sourceId: `artifact:${artifactId}`,
    taskId: 'task-1',
    runId: 'run-1',
    createdAt: '2026-07-15T00:00:00.000Z',
  };
}

function generatedImage(): GeneratedImage {
  return {
    type: 'generated-image',
    id: 'shot-1',
    path: '/workspace/project/neko/generated/image/shot-1.png',
    mimeType: 'image/png',
    generatedAt: '2026-07-15T00:00:00.000Z',
    prompt: 'A silent megastructure under hard light',
    model: 'image-model',
    sourceNodeId: 'shot-node-1',
    width: 2048,
    height: 1152,
    ratio: '16:9',
    lifecycle: createGeneratedAssetRevisionRef({
      assetId: 'shot-1',
      contentDigest: 'sha256:shot-1',
      contentPath: 'neko/generated/image/shot-1.png',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: {
        operationId: 'operation-1',
        runId: 'run-1',
        providerId: 'image-provider',
        modelId: 'image-model',
      },
    }),
  };
}
