import { describe, expect, it } from 'vitest';
import type { ToolResultBackfillPayload } from '@neko/shared';
import { applyToolResultBackfillToResult } from '../tool-result-backfill';

describe('perception path policy', () => {
  it('persists backfilled perception metadata using stable refs only', () => {
    const payload: ToolResultBackfillPayload = {
      toolCallId: 'call-1',
      timestamp: 1,
      dataPatch: {
        status: 'completed',
        resultAssetRefs: [
          {
            assetId: 'asset-1',
            uri: '${WORKSPACE}/.neko/generated/image/out.png',
            mimeType: 'image/png',
          },
        ],
        thumbnailAssetRef: {
          assetId: 'asset-1',
          uri: '${WORKSPACE}/.neko/generated/image/out.png',
          mimeType: 'image/png',
        },
      },
      attachments: [
        {
          type: 'image',
          path: '${WORKSPACE}/.neko/generated/image/out.png',
          mimeType: 'image/png',
          assetRef: {
            assetId: 'asset-1',
            uri: '${WORKSPACE}/.neko/generated/image/out.png',
            mimeType: 'image/png',
          },
        },
      ],
      perceptionCards: [
        {
          version: 1,
          assetId: 'asset-1',
          modality: 'image',
          createdAt: 1,
          layerStatus: { layer0: 'complete', layer1: 'complete', layer2: 'complete' },
          structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
          semantic: {
            evidences: [{ kind: 'description', confidence: 0.9, value: 'A cat.' }],
          },
          perceptual: {
            thumbnailRef: {
              assetId: 'asset-1-thumb',
              uri: '${WORKSPACE}/.neko/generated/image/thumb.png',
              mimeType: 'image/png',
            },
          },
        },
      ],
    };

    const merged = applyToolResultBackfillToResult(
      { success: true, data: { taskId: 'task-1', status: 'queued' } },
      payload,
    );

    assertNoPersistedHostPayload(JSON.stringify(payload));
    assertNoPersistedHostPayload(JSON.stringify(merged.result));
  });

  it('rejects host-specific persisted payload examples', () => {
    for (const unsafe of [
      'file:///repo/out.png',
      'webview://out.png',
      'vscode-resource://out.png',
      'https://file+.vscode-resource.vscode-cdn.net/out.png',
      'data:image/png;base64,abc',
      '/repo/.neko/generated/out.png',
      'C:\\Users\\me\\out.png',
    ]) {
      expect(isHostSpecificPersistedPayload(unsafe), unsafe).toBe(true);
    }
  });
});

function assertNoPersistedHostPayload(serialized: string): void {
  expect(isHostSpecificPersistedPayload(serialized), serialized).toBe(false);
}

function isHostSpecificPersistedPayload(value: string): boolean {
  return (
    value.includes('file://') ||
    value.includes('webview://') ||
    value.includes('vscode-resource') ||
    value.includes('vscode-webview') ||
    value.includes('base64,') ||
    /(^|["\s])\/(?:Users|home|tmp|repo|var|private)\//.test(value) ||
    /[A-Za-z]:\\/.test(value)
  );
}
