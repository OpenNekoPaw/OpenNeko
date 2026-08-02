import { describe, expect, it } from 'vitest';
import { createGeneratedAssetRevisionRef, validateGeneratedAssetRevisionRef } from '..';

describe('generated asset lifecycle', () => {
  it('creates locator-only revision identity without cache descriptors or host/cache paths', () => {
    const lifecycle = createLifecycle('draft-1', 'sha256:same', 'operation-1');

    expect(lifecycle.contentLocator).toEqual({
      kind: 'generated-output',
      outputId: 'draft-1',
      revision: lifecycle.revision,
      digest: 'sha256:same',
      path: 'neko/generated/image/draft-1.png',
    });
    expect(lifecycle).not.toHaveProperty('resourceRef');
    expect(lifecycle.generation).not.toHaveProperty('sourceRefs');
    expect(JSON.stringify(lifecycle)).not.toContain('/.neko/.cache/');
  });

  it('rejects retired lifecycle fields and mismatched locator identity', () => {
    const lifecycle = createLifecycle('draft-1', 'sha256:same', 'operation-1');

    expect(
      validateGeneratedAssetRevisionRef({
        ...lifecycle,
        resourceRef: { id: 'legacy-resource' },
      }),
    ).toEqual({
      ok: false,
      diagnostic: 'Generated asset lifecycle contains unsupported or legacy fields.',
    });
    expect(
      validateGeneratedAssetRevisionRef({
        ...lifecycle,
        generation: {
          ...lifecycle.generation,
          sourceRefs: [],
        },
      }),
    ).toEqual({
      ok: false,
      diagnostic: 'Generated asset lifecycle structure is invalid.',
    });
    expect(
      validateGeneratedAssetRevisionRef({
        ...lifecycle,
        contentLocator: {
          ...lifecycle.contentLocator,
          outputId: 'different-output',
        },
      }),
    ).toEqual({
      ok: false,
      diagnostic:
        'Generated asset lifecycle identity does not match its generated-output content locator.',
    });
  });
});

function createLifecycle(assetId: string, contentDigest: string, operationId: string) {
  return createGeneratedAssetRevisionRef({
    assetId,
    contentDigest,
    contentPath: `neko/generated/image/${assetId}.png`,
    mediaKind: 'image',
    mimeType: 'image/png',
    generation: {
      operationId,
      runId: 'run-1',
      workflowStage: { workflowId: 'workflow-1', stageId: 'shot-generation' },
    },
  });
}
