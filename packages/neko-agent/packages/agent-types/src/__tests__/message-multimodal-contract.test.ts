import { describe, expect, it } from 'vitest';
import type {
  AgentArtifactTransferPayload,
  CompositeBlockData,
  ContentBlock,
  ExtensionToWebviewMessage,
  ToolCall,
} from '../index';

describe('multimodal message contracts', () => {
  it('preserves backfilled tool result fields on ToolCall', () => {
    const toolCall: ToolCall = {
      id: 'call-1',
      name: 'GenerateImage',
      arguments: { prompt: 'rain' },
      result: {
        success: true,
        data: { status: 'completed' },
        attachments: [
          {
            type: 'image',
            path: '${WORKSPACE}/out.png',
            mimeType: 'image/png',
            assetRef: {
              assetId: 'asset-1',
              uri: '${WORKSPACE}/out.png',
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
            layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'skipped' },
            structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
          },
        ],
        backfillDiagnostics: [
          {
            path: 'prompt',
            reason: 'conflict',
            existing: 'rain',
            incoming: 'snow',
          },
        ],
        artifacts: [makeArtifactSnapshot()],
      },
    };

    expect(JSON.parse(JSON.stringify(toolCall))).toEqual(toolCall);
  });

  it('preserves tool result backfill protocol messages', () => {
    const message: ExtensionToWebviewMessage = {
      type: 'toolResultBackfill',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'call-1',
      dataPatch: { status: 'completed' },
      attachments: [
        {
          type: 'image',
          path: '${WORKSPACE}/out.png',
          mimeType: 'image/png',
        },
      ],
      perceptionCards: [
        {
          version: 1,
          assetId: 'asset-1',
          modality: 'image',
          createdAt: 1,
          layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'skipped' },
          structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
        },
      ],
      backfillDiagnostics: [],
      artifacts: [makeArtifactSnapshot()],
    };

    expect(message).toMatchObject({
      type: 'toolResultBackfill',
      toolCallId: 'call-1',
      dataPatch: { status: 'completed' },
      artifacts: [{ type: 'artifactSnapshot' }],
    });
  });

  it('preserves composite content blocks beside text/tool blocks', () => {
    const composite: CompositeBlockData = {
      template: 'storyboard-table',
      title: 'Storyboard',
      sections: [
        {
          heading: 'Shot 1',
          content: 'Opening frame',
          layout: 'table-row',
          mediaRefs: [{ toolCallId: 'call-1', assetIndex: 0, caption: 'Variant A' }],
        },
      ],
    };
    const blocks: ContentBlock[] = [
      { id: 'text-1', type: 'text', timestamp: 1, content: 'Plan' },
      {
        id: 'composite-1',
        type: 'composite',
        timestamp: 2,
        composite,
      },
    ];

    expect(JSON.parse(JSON.stringify(blocks))).toEqual(blocks);
  });
});

function makeArtifactSnapshot(): AgentArtifactTransferPayload {
  return {
    type: 'artifactSnapshot',
    artifact: {
      schemaVersion: 1,
      kind: 'composite-artifact',
      artifactId: 'artifact-1',
      title: 'Shot plan',
      blocks: [
        {
          blockId: 'summary',
          kind: 'text',
          text: 'Review shots.',
        },
      ],
    },
    complete: true,
  };
}
