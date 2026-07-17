import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  validateCanvasWorkspaceProjectionRequest,
} from '@neko/shared';
import { cleanupLegacyCanvasBoardMetadata } from './legacyCanvasBoardMetadataCleanup';

describe('cleanupLegacyCanvasBoardMetadata', () => {
  it('removes only obsolete Memento bindings and preserves ordinary Board data', async () => {
    const values = new Map<string, unknown>([
      [
        'neko.agent.canvasBoardBindings.v1',
        { conversation: { documentRef: { path: 'neko/boards/concept.nkc' } } },
      ],
      ['unrelated.setting', { keep: true }],
    ]);
    const ordinaryBoard = '{"version":"1.0","id":"concept"}';
    const update = vi.fn(async (key: string, value: unknown) => {
      if (value === undefined) values.delete(key);
      else values.set(key, value);
    });

    await expect(
      cleanupLegacyCanvasBoardMetadata({
        get: <T>(key: string, defaultValue?: T) =>
          (values.has(key) ? values.get(key) : defaultValue) as T,
        update,
      }),
    ).resolves.toEqual({ removedKeys: ['neko.agent.canvasBoardBindings.v1'] });

    expect(values.get('unrelated.setting')).toEqual({ keep: true });
    expect(ordinaryBoard).toBe('{"version":"1.0","id":"concept"}');
    expect(
      validateCanvasWorkspaceProjectionRequest({
        version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
        target: {
          workspaceUri: 'file:///workspace/project/',
          documentUri: 'file:///workspace/project/neko/boards/concept.nkc',
        },
        provenance: {
          version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
          projectionId: 'projection:existing-board',
          artifactId: 'artifact-1',
          revision: 'revision-1',
          kind: 'image',
          sourceId: 'generated-output:artifact-1',
          createdAt: '2026-07-15T00:00:00.000Z',
        },
        artifact: {
          kind: 'image',
          title: 'Existing output',
          mimeType: 'image/png',
          resourceRef: {
            id: 'generated-output:artifact-1',
            scope: 'project',
            provider: 'generated-output',
            kind: 'generated',
            source: {
              kind: 'generated-asset',
              generatedAssetId: 'artifact-1',
              projectRelativePath: 'neko/generated/image/artifact-1.png',
            },
            locator: { kind: 'generated-asset', assetId: 'artifact-1' },
            fingerprint: { strategy: 'hash', value: 'sha256:artifact-1' },
          },
        },
      }),
    ).toEqual([]);
  });

  it('is idempotent when obsolete metadata is already absent', async () => {
    const update = vi.fn();
    await expect(
      cleanupLegacyCanvasBoardMetadata({ get: () => undefined, update }),
    ).resolves.toEqual({ removedKeys: [] });
    expect(update).not.toHaveBeenCalled();
  });
});
