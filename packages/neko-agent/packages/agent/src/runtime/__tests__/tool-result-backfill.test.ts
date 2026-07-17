import { describe, expect, it } from 'vitest';
import type {
  PerceptionCard,
  ToolResultArtifactTransfer,
  ToolResultAttachment,
  ToolResultBackfillPayload,
} from '@neko/shared';
import {
  applyToolResultBackfillToResult,
  mergeToolResultArtifacts,
  mergeToolResultBackfillData,
  mergeToolResultPerceptionCards,
} from '../tool-result-backfill';

describe('tool result backfill merge', () => {
  it('shallow merges allowlisted keys while preserving unrelated existing values', () => {
    const merged = mergeToolResultBackfillData(
      { taskId: 'task-1', status: 'queued', prompt: 'keep' },
      { status: 'completed', prompt: 'incoming', width: 1024 },
    );

    expect(merged.data).toEqual({
      taskId: 'task-1',
      status: 'completed',
      prompt: 'keep',
      width: 1024,
    });
    expect(merged.diagnostics).toEqual([
      { path: 'prompt', reason: 'conflict', existing: 'keep', incoming: 'incoming' },
    ]);
  });

  it('deduplicates attachments without replacing existing metadata and merges perception cards by identity', () => {
    const attachment: ToolResultAttachment = {
      type: 'image',
      path: '${WORKSPACE}/out.png',
      mimeType: 'image/png',
    };
    const incomingAttachment: ToolResultAttachment = {
      ...attachment,
      assetRef: {
        assetId: 'incoming-asset',
        uri: '${WORKSPACE}/incoming.png',
        mimeType: 'image/png',
      },
    };
    const incomingCard = makeCard('asset-1', 2, 'cache');

    const merged = applyToolResultBackfillToResult(
      {
        success: true,
        data: { status: 'queued' },
        attachments: [attachment],
        perceptionCards: [makeCard('asset-1', 1, 'cache')],
      },
      {
        toolCallId: 'call-1',
        timestamp: 1,
        dataPatch: { status: 'completed' },
        attachments: [incomingAttachment],
        perceptionCards: [incomingCard],
      },
    );

    expect(merged.result.attachments).toEqual([attachment]);
    expect(merged.result.perceptionCards).toEqual([incomingCard]);
    expect(merged.result.data).toEqual({ status: 'completed' });
  });

  it('returns missing-tool-call diagnostic without creating success', () => {
    const payload: ToolResultBackfillPayload = {
      toolCallId: 'missing',
      timestamp: 1,
      dataPatch: { status: 'completed' },
    };

    const merged = applyToolResultBackfillToResult(undefined, payload);

    expect(merged.result.success).toBe(false);
    expect(merged.diagnostics).toEqual([
      { path: 'missing', reason: 'missing-tool-call', incoming: payload },
    ]);
  });

  it('appends different perception cards and sorts by creation time', () => {
    expect(
      mergeToolResultPerceptionCards(
        [makeCard('asset-2', 3, 'cache-a')],
        [makeCard('asset-1', 1), makeCard('asset-2', 4, 'cache-b')],
      ),
    ).toEqual([
      makeCard('asset-1', 1),
      makeCard('asset-2', 3, 'cache-a'),
      makeCard('asset-2', 4, 'cache-b'),
    ]);
  });

  it('merges composite artifact transfer payloads by stable artifact identity', () => {
    const original = makeArtifactSnapshot('artifact-1', 'Draft plan');
    const replacement = makeArtifactSnapshot('artifact-1', 'Updated plan');
    const page: ToolResultArtifactTransfer = {
      type: 'artifactBlockPage',
      artifactId: 'artifact-1',
      blocks: [{ blockId: 'b2', kind: 'text', text: 'Page 2' }],
      cursor: 'page-2',
      complete: true,
    };

    const merged = applyToolResultBackfillToResult(
      {
        success: true,
        data: { status: 'queued' },
        artifacts: [original],
      },
      {
        toolCallId: 'call-1',
        timestamp: 2,
        dataPatch: { status: 'completed' },
        artifacts: [replacement, page],
      },
    );

    expect(merged.result.artifacts).toEqual([replacement, page]);
    expect(mergeToolResultArtifacts([original], [replacement])).toEqual([replacement]);
  });
});

function makeCard(assetId: string, createdAt: number, cacheKey?: string): PerceptionCard {
  return {
    version: 1,
    assetId,
    modality: 'image',
    createdAt,
    layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'skipped' },
    structural: { format: 'png', mimeType: 'image/png', byteSize: 1 },
    ...(cacheKey ? { cacheKey } : {}),
  };
}

function makeArtifactSnapshot(artifactId: string, title: string): ToolResultArtifactTransfer {
  return {
    type: 'artifactSnapshot',
    complete: true,
    artifact: {
      schemaVersion: 1,
      kind: 'composite-artifact',
      artifactId,
      title,
      blocks: [{ blockId: 'b1', kind: 'text', text: title }],
    },
  };
}
