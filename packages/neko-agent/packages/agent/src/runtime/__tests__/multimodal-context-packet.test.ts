import { describe, expect, it, vi } from 'vitest';
import {
  applyEvidenceFeedbackPolicy,
  buildTurnMultimodalContextPacket,
  createToolProducedMultimodalEvidenceFeedback,
  createCanvasSelectionContextPacket,
  createMediaAttachmentContextPacket,
  createTimelineSelectionContextPacket,
  filterToolsByModalityAvailability,
  loadPacketMediaPayloads,
  projectGeneratedArtifactReference,
  summarizeEvidenceFeedback,
} from '../turn/multimodal-context-packet';

describe('multimodal-context-packet runtime', () => {
  it('builds one packet from image attachments, timeline, canvas, and audio/video metadata', () => {
    const timeline = createTimelineSelectionContextPacket(
      [
        {
          elementId: 'clip-1',
          trackId: 'v1',
          sourceUri: '${WORKSPACE}/media/clip.mp4',
          mediaType: 'video',
          durationMs: 4000,
        },
      ],
      { createdAt: 10, playheadMs: 1200 },
    );
    const canvas = createCanvasSelectionContextPacket(
      [
        {
          nodeId: 'shot-1',
          type: 'shot',
          summary: 'Hero shot',
          assetUri: '${WORKSPACE}/shot.png',
          assetKind: 'image',
        },
      ],
      { createdAt: 10 },
    );

    const packet = buildTurnMultimodalContextPacket({
      conversationId: 'conv-1',
      message: 'revise this scene',
      imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'YWJj' }],
      mediaAttachments: [
        {
          id: 'voice',
          uri: '${WORKSPACE}/voice.wav',
          modality: 'audio',
          metadata: {
            mimeType: 'audio/wav',
            durationMs: 1800,
            sampleRate: 48000,
            uriPolicy: 'workspace-uri',
          },
        },
        {
          id: 'reference-video',
          uri: '${WORKSPACE}/ref.mp4',
          modality: 'video',
          metadata: {
            mimeType: 'video/mp4',
            durationMs: 2400,
            frameRate: 24,
            uriPolicy: 'workspace-uri',
          },
        },
      ],
      timelineContextPacket: timeline,
      canvasContextPacket: canvas,
      createdAt: 20,
    });

    expect(packet).toMatchObject({
      metadata: {
        conversationId: 'conv-1',
      },
      uiContext: {
        userAnnotation: 'revise this scene',
      },
    });
    expect(packet?.perceptionInputs.map((input) => input.modality)).toEqual([
      'text',
      'image',
      'audio',
      'video',
      'image',
      'image',
    ]);
    expect(packet?.artifactRefs.map((artifact) => artifact.kind)).toEqual([
      'image',
      'audio',
      'video',
      'video',
      'image',
    ]);
  });

  it('records evidence as withheld when evidence injection is disabled', () => {
    const packet = buildTurnMultimodalContextPacket({
      message: 'inspect video',
      evidenceRefs: [
        {
          id: 'evidence-1',
          source: 'engine',
          modality: 'video',
          summary: 'Motion evidence',
        },
      ],
      includeEvidence: false,
      createdAt: 1,
    });

    expect(packet?.metadata?.['evidenceRefs']).toEqual([
      {
        id: 'evidence-1',
        source: 'engine',
        modality: 'video',
        summary: 'Motion evidence',
        withheld: true,
        withheldReason: 'policy',
      },
    ]);
  });

  it('filters modality-gated tools using packet evidence availability', () => {
    const packet = createMediaAttachmentContextPacket({
      id: 'clip',
      uri: '${WORKSPACE}/clip.mp4',
      modality: 'video',
      metadata: { mimeType: 'video/mp4' },
      createdAt: 1,
    });

    expect(
      filterToolsByModalityAvailability(
        [
          {
            toolName: 'video_quality',
            acceptedModalities: ['video'],
            requiredEvidence: ['video'],
          },
          {
            toolName: 'audio_quality',
            acceptedModalities: ['audio'],
            requiredEvidence: ['audio'],
          },
          {
            toolName: 'read_file',
            acceptedModalities: ['text', 'data'],
          },
        ],
        packet,
        ['video_quality', 'audio_quality', 'read_file'],
      ),
    ).toEqual(['video_quality', 'read_file']);
  });

  it('keeps media payload loading behind a host adapter', async () => {
    const packet = createMediaAttachmentContextPacket({
      id: 'image',
      uri: '${WORKSPACE}/image.png',
      modality: 'image',
      metadata: { mimeType: 'image/png' },
      createdAt: 1,
    });
    const adapter = {
      loadMediaPayload: vi.fn(async () => ({
        encoding: 'base64' as const,
        data: 'abc',
        mimeType: 'image/png',
      })),
    };

    await expect(loadPacketMediaPayloads(packet, adapter)).resolves.toEqual([
      { encoding: 'base64', data: 'abc', mimeType: 'image/png' },
    ]);
    expect(adapter.loadMediaPayload).toHaveBeenCalledWith({
      artifactId: 'artifact-attachment-image',
      uri: '${WORKSPACE}/image.png',
      modality: 'image',
      preferredEncoding: 'base64',
    });
  });

  it('projects generated media artifacts with conversation and task linkage', () => {
    expect(
      projectGeneratedArtifactReference({
        id: 'asset-1',
        type: 'video',
        uri: '${WORKSPACE}/out.mp4',
        mimeType: 'video/mp4',
        conversationId: 'conv-1',
        taskId: 'task-1',
        toolCallId: 'tool-1',
      }),
    ).toMatchObject({
      artifactRefs: [
        {
          id: 'generated-asset-1',
          kind: 'video',
          uri: '${WORKSPACE}/out.mp4',
          mimeType: 'video/mp4',
          metadata: {
            conversationId: 'conv-1',
            taskId: 'task-1',
            toolCallId: 'tool-1',
          },
        },
      ],
    });
  });

  it('converts image tool attachments into artifact and next-turn evidence refs', () => {
    const feedback = createToolProducedMultimodalEvidenceFeedback({
      conversationId: 'conv-1',
      taskId: 'task-1',
      toolCallId: 'tool-1',
      toolName: 'generate_image',
      attachments: [{ type: 'image', path: '${WORKSPACE}/out.png', mimeType: 'image/png' }],
    });

    const packet = buildTurnMultimodalContextPacket({
      message: 'use previous render',
      evidenceFeedback: feedback,
      createdAt: 1,
    });

    expect(packet?.artifactRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'image',
          uri: '${WORKSPACE}/out.png',
          metadata: expect.objectContaining({
            conversationId: 'conv-1',
            taskId: 'task-1',
            toolCallId: 'tool-1',
          }),
        }),
      ]),
    );
    expect(packet?.metadata?.['evidenceRefs']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'tool',
          modality: 'image',
          toolCallId: 'tool-1',
        }),
      ]),
    );
  });

  it('preserves video perception evidence provenance from structured tool data', () => {
    const feedback = createToolProducedMultimodalEvidenceFeedback({
      conversationId: 'conv-1',
      toolCallId: 'perception-1',
      toolName: 'detect_shots',
      resultData: {
        artifacts: [
          {
            id: 'clip-1',
            type: 'video',
            uri: '${WORKSPACE}/clip.mp4',
            mimeType: 'video/mp4',
            metadata: { durationMs: 2400 },
          },
        ],
        evidence: [
          {
            id: 'shot-boundary-1',
            source: 'engine',
            modality: 'video',
            summary: 'Hard cut at 1.2s',
            perceptionInputId: 'input-shot-1',
          },
        ],
      },
    });

    expect(feedback[0]?.evidence).toMatchObject({
      id: 'shot-boundary-1',
      source: 'engine',
      modality: 'video',
      summary: 'Hard cut at 1.2s',
      sourceArtifactId: 'clip-1',
      perceptionInputId: 'input-shot-1',
      conversationId: 'conv-1',
      toolCallId: 'perception-1',
    });
  });

  it('supports summary-only injection and evidence feedback policy', () => {
    const feedback = createToolProducedMultimodalEvidenceFeedback({
      toolCallId: 'tool-1',
      attachments: [{ type: 'video', path: '${WORKSPACE}/clip.mp4', mimeType: 'video/mp4' }],
    });
    const included = applyEvidenceFeedbackPolicy(feedback, { includeEvidence: true });
    const withheld = applyEvidenceFeedbackPolicy(feedback, {
      includeEvidence: false,
    });

    expect(summarizeEvidenceFeedback(included)).toContain('Feedback evidence included');
    expect(withheld[0]).toMatchObject({
      withheld: true,
      withheldReason: 'policy',
    });
  });

  it('enforces bounded host-adapter payload loading', async () => {
    const packet = createMediaAttachmentContextPacket({
      id: 'image',
      uri: '${WORKSPACE}/image.png',
      modality: 'image',
      metadata: { mimeType: 'image/png' },
      createdAt: 1,
    });
    const adapter = {
      loadMediaPayload: vi.fn(async () => ({
        encoding: 'base64' as const,
        data: 'YWJjZA==',
        mimeType: 'image/png',
      })),
    };

    await expect(loadPacketMediaPayloads(packet, adapter, { maxBytes: 3 })).rejects.toThrow(
      /exceeds maxBytes/,
    );
    expect(adapter.loadMediaPayload).toHaveBeenCalledWith(expect.objectContaining({ maxBytes: 3 }));
  });
});
