import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOOL_RESULT_BACKFILL_OVERWRITE_KEYS,
  selectLatestPerceptionCard,
  type PerceptionCard,
  type ToolResultBackfillPayload,
} from '../index';

describe('perception card contracts', () => {
  it('keeps PerceptionCard JSON-serializable with stable asset refs', () => {
    const card: PerceptionCard = {
      version: 1,
      assetId: 'asset-1',
      modality: 'image',
      sourceToolCallId: 'call-1',
      createdAt: 10,
      layerStatus: {
        layer0: 'complete',
        layer1: 'complete',
        layer2: 'skipped',
      },
      structural: {
        format: 'png',
        mimeType: 'image/png',
        byteSize: 1024,
        width: 512,
        height: 512,
      },
      semantic: {
        evidences: [
          {
            kind: 'description',
            confidence: 0.82,
            value: 'A red umbrella in rain.',
            diagnostics: { retryCount: 0 },
          },
        ],
      },
      perceptual: {
        thumbnailRef: {
          assetId: 'asset-1-thumb',
          uri: '${WORKSPACE}/.neko/generated/image/thumb.png',
          mimeType: 'image/png',
        },
      },
      cost: { totalMs: 12, tokenEstimate: 32, gpuUsed: false },
      cacheKey: 'asset-1:l1',
    };

    expect(JSON.parse(JSON.stringify(card))).toEqual(card);
    expect(card.perceptual?.thumbnailRef?.uri).not.toContain('file://');
  });

  it('selects latest perception card optionally scoped by asset id', () => {
    const older = makeCard('asset-1', 1);
    const latest = makeCard('asset-1', 2);
    const other = makeCard('asset-2', 3);

    expect(selectLatestPerceptionCard([older, latest, other], 'asset-1')).toBe(latest);
    expect(selectLatestPerceptionCard([older, latest, other])).toBe(other);
  });

  it('defines host-agnostic backfill payload defaults', () => {
    const payload: ToolResultBackfillPayload = {
      toolCallId: 'call-1',
      timestamp: 1,
      dataPatch: {
        status: 'completed',
        thumbnailAssetRef: {
          assetId: 'asset-1',
          uri: '${WORKSPACE}/.neko/generated/image/out.png',
          mimeType: 'image/png',
        },
      },
    };

    expect(DEFAULT_TOOL_RESULT_BACKFILL_OVERWRITE_KEYS).toContain('status');
    expect(JSON.stringify(payload)).not.toContain('file://');
  });
});

function makeCard(assetId: string, createdAt: number): PerceptionCard {
  return {
    version: 1,
    assetId,
    modality: 'image',
    createdAt,
    layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'skipped' },
    structural: { format: 'png', mimeType: 'image/png', byteSize: 1 },
  };
}
