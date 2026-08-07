import { describe, expect, it } from 'vitest';
import { createGeneratedAssetRevisionRef, validateGeneratedAssetRevisionRef } from '..';

describe('generated asset lifecycle', () => {
  it('creates locator-only revision identity with a canonical managed output path', () => {
    const lifecycle = createLifecycle('draft-1', 'sha256:same', 'operation-1');

    expect(lifecycle.contentLocator).toEqual({
      kind: 'generated-output',
      outputId: 'draft-1',
      digest: 'sha256:same',
      path: 'neko/generated/image/draft-1.png',
    });
  });

  it('rejects unsupported fields and mismatched locator identity', () => {
    const lifecycle = createLifecycle('draft-1', 'sha256:same', 'operation-1');

    expect(
      validateGeneratedAssetRevisionRef({
        ...lifecycle,
        unexpectedField: 'unsupported',
      }),
    ).toEqual({
      ok: false,
      diagnostic: 'Generated asset lifecycle contains unsupported fields.',
    });
    expect(
      validateGeneratedAssetRevisionRef({
        ...lifecycle,
        generation: {
          ...lifecycle.generation,
          workflowStage: {
            ...lifecycle.generation.workflowStage,
            unexpectedField: 'unsupported-stage-field',
          },
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
