import { describe, expect, it } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  CANVAS_WORKSPACE_BOARD_PATH,
  createGeneratedAssetsWorkspaceDeliveryRequest,
  resolveCanvasWorkspaceBoardDocumentUri,
  validateCanvasWorkspaceProjectionRequest,
  validateCanvasWorkspaceProjectionResult,
  type CanvasWorkspaceProjectionArtifact,
  type CanvasWorkspaceProjectionRequest,
} from '../canvas-workspace-board';
import type { GeneratedImage } from '../generated-asset';
import { createGeneratedAssetRevisionRef } from '../generated-asset-lifecycle';
import type { ResourceRef } from '../resource-cache';

const generatedRef: ResourceRef = {
  id: 'generated-output:shot-1',
  scope: 'project',
  provider: 'generated-output',
  kind: 'generated',
  source: {
    kind: 'generated-asset',
    generatedAssetId: 'shot-1',
    projectRelativePath: 'neko/generated/image/shot-1.png',
  },
  locator: { kind: 'generated-asset', assetId: 'shot-1' },
  fingerprint: { strategy: 'hash', value: 'sha256:shot-1' },
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
            revision: 'source:sha256:shot-2',
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
    expect(first.artifacts.map(({ provenance }) => provenance.revision)).toEqual(
      second.artifacts.map(({ provenance }) => provenance.revision),
    );
    expect(JSON.stringify(first)).not.toMatch(/activeCanvas|recentCanvas|conversationId|binding/iu);
  });

  it('creates one generated batch with portable generation provenance', () => {
    const delivery = createGeneratedAssetsWorkspaceDeliveryRequest([generatedImage()], {
      workspaceId: 'workspace-1',
      workspaceUri: 'file:///workspace/project/',
      sourceHost: 'tui',
    });

    expect(delivery).toMatchObject({
      version: 2,
      target: { workspaceId: 'workspace-1', workspaceUri: 'file:///workspace/project/' },
      process: { sourceHost: 'tui', taskId: 'task-1', runId: 'run-1' },
      artifacts: [
        {
          kind: 'image',
          generationContext: {
            prompt: 'A silent megastructure under hard light',
            model: 'image-model-v2',
            sourceNodeId: 'shot-node-1',
            aspectRatio: '16:9',
            width: 2048,
            height: 1152,
          },
          provenance: { role: 'output', artifactId: 'shot-1' },
        },
      ],
    });
    expect(validateCanvasWorkspaceProjectionRequest(delivery)).toEqual([]);
    expect(JSON.stringify(delivery)).not.toContain('/workspace/project/neko/generated');
  });

  it('poisons legacy routing, runtime handles, cache values, and malformed refs', () => {
    const invalid = {
      ...request(),
      activeCanvas: 'file:///workspace/project/active.nkc',
      recentCanvas: 'file:///workspace/project/recent.nkc',
      conversationId: 'conversation-1',
      binding: { scopeKind: 'storyboard' },
      token: 'secret',
      renderUri: 'vscode-webview://preview/shot-1',
      cachePath: '.neko/.cache/generated/shot-1.png',
    } as unknown as CanvasWorkspaceProjectionRequest;
    const malformedRef = request({
      artifacts: [
        {
          ...outputArtifact(),
          resourceRef: {
            ...generatedRef,
            source: {
              ...generatedRef.source,
              projectRelativePath: '.neko/.cache/generated/unsafe.png',
            },
          },
        },
      ],
    });

    const invalidCodes = validateCanvasWorkspaceProjectionRequest(invalid).map(({ code }) => code);
    expect(invalidCodes.filter((code) => code === 'legacy-routing-forbidden')).toHaveLength(4);
    expect(invalidCodes.filter((code) => code === 'runtime-value-forbidden')).toHaveLength(3);
    expect(
      validateCanvasWorkspaceProjectionRequest(malformedRef).map(({ code }) => code),
    ).toContain('invalid-resource-ref');
  });

  it('keeps blocked and conflict results target-free', () => {
    for (const status of ['blocked', 'conflict'] as const) {
      expect(
        validateCanvasWorkspaceProjectionResult({
          version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
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
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    target: {
      workspaceId: input.workspaceId ?? 'workspace-1',
      workspaceUri: 'file:///workspace/project/',
      ...(input.documentUri ? { documentUri: input.documentUri } : {}),
    },
    process: {
      deliveryId: 'delivery:material-analysis:1',
      sourceHost: 'tui',
      taskId: 'task-1',
      runId: 'run-1',
      createdAt: '2026-07-15T00:00:00.000Z',
    },
    artifacts: input.artifacts ?? [sourceArtifact(), markdownArtifact(), outputArtifact()],
  };
}

function sourceArtifact(): CanvasWorkspaceProjectionArtifact {
  return {
    kind: 'file-reference',
    title: 'Source image',
    resourceRef: generatedRef,
    provenance: provenance('source-1', 'source:sha256:shot-1', 'file-reference', 'source'),
  };
}

function markdownArtifact(): CanvasWorkspaceProjectionArtifact {
  return {
    kind: 'markdown',
    title: 'Material Analysis',
    markdown: '# Material Analysis\n\nReviewable findings.',
    provenance: provenance('analysis-1', 'markdown:sha256:analysis-1', 'markdown', 'analysis'),
  };
}

function outputArtifact(): CanvasWorkspaceProjectionArtifact {
  return {
    kind: 'image',
    title: 'Shot 1',
    mimeType: 'image/png',
    resourceRef: generatedRef,
    provenance: provenance('shot-1', 'generated:sha256:shot-1', 'image', 'output'),
  };
}

function provenance(
  artifactId: string,
  revision: string,
  kind: CanvasWorkspaceProjectionArtifact['kind'],
  role: 'source' | 'analysis' | 'output',
) {
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    deliveryId: 'delivery:material-analysis:1',
    artifactId,
    revision,
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
    model: 'image-model-v2',
    sourceNodeId: 'shot-node-1',
    width: 2048,
    height: 1152,
    ratio: '16:9',
    lifecycle: createGeneratedAssetRevisionRef({
      assetId: 'shot-1',
      contentDigest: 'sha256:shot-1',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: {
        taskId: 'task-1',
        runId: 'run-1',
        providerId: 'image-provider',
        modelId: 'image-model-v2',
      },
    }),
  };
}
