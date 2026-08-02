import { describe, expect, it } from 'vitest';
import {
  hasSelectionRef,
  isPerceptionInputTraceable,
  type MultimodalContextPacket,
  type PerceptionInputRef,
} from '../multimodal-context';

function expectFirstInput(packet: MultimodalContextPacket): PerceptionInputRef {
  const input = packet.perceptionInputs[0];
  if (!input) {
    throw new Error('expected at least one perception input');
  }
  return input;
}

function createTimelinePacket(): MultimodalContextPacket {
  return {
    id: 'ctx-timeline-shot-3',
    selection: [
      {
        id: 'sel-shot-3',
        kind: 'timeline-clip',
        panel: 'timeline',
        projectObjectId: 'clip-shot-3',
        artifactId: 'asset-shot-3',
        timeMs: 1_200,
      },
    ],
    artifactRefs: [
      {
        id: 'asset-shot-3',
        kind: 'video',
        uri: '${PROJECT}/shots/shot-3.mp4',
        mimeType: 'video/mp4',
      },
    ],
    projectRefs: [
      {
        id: 'clip-shot-3',
        kind: 'timeline-clip',
        engineObjectId: 'engine-clip-shot-3',
        artifactIds: ['asset-shot-3'],
      },
    ],
    perceptionInputs: [
      {
        id: 'input-shot-3-frame-1200',
        kind: 'video-frame',
        modality: 'image',
        sourceSelectionId: 'sel-shot-3',
        artifactId: 'asset-shot-3',
        projectObjectId: 'clip-shot-3',
        uri: '${CACHE}/frames/shot-3-1200.png',
        timeMs: 1_200,
      },
    ],
    uiContext: {
      activePanel: 'timeline',
      selectionIds: ['sel-shot-3'],
      timeline: {
        playheadMs: 1_200,
        activeTrackId: 'video-track-1',
      },
    },
    createdAt: 1_771_718_404_000,
  };
}

describe('multimodal context contracts', () => {
  it('keeps UI context as selection and view state only', () => {
    const packet = createTimelinePacket();

    expect(packet.uiContext.activePanel).toBe('timeline');
    expect(packet.uiContext.selectionIds).toEqual(['sel-shot-3']);
    expect(packet.uiContext.timeline?.playheadMs).toBe(1_200);
    expect(packet.selection[0]?.artifactId).toBe('asset-shot-3');
  });

  it('links perception inputs back to selection, artifact, and project refs', () => {
    const packet = createTimelinePacket();
    const input = expectFirstInput(packet);

    expect(hasSelectionRef(packet, 'sel-shot-3')).toBe(true);
    expect(isPerceptionInputTraceable(packet, input)).toBe(true);
  });

  it('rejects orphan perception inputs', () => {
    const packet = createTimelinePacket();

    expect(
      isPerceptionInputTraceable(packet, {
        id: 'input-orphan',
        kind: 'canvas-crop',
        modality: 'image',
        sourceSelectionId: 'missing-selection',
      }),
    ).toBe(false);
  });
});
