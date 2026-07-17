import { describe, expect, it, vi } from 'vitest';
import type { MultimodalContextPacket } from '@neko/shared';
import { resolvePerceptionContextPacket } from '../index';

function createPacket(): MultimodalContextPacket {
  return {
    id: 'ctx-perception',
    selection: [],
    artifactRefs: [],
    projectRefs: [],
    perceptionInputs: [
      {
        id: 'input-1',
        kind: 'video-frame',
        modality: 'image',
        uri: '${PROJECT}/shots/shot-1.mp4',
      },
    ],
    uiContext: { activePanel: 'timeline', selectionIds: [] },
    createdAt: 1,
  };
}

describe('resolvePerceptionContextPacket', () => {
  it('keeps packets unchanged when no materializer is registered', async () => {
    const packet = createPacket();

    await expect(resolvePerceptionContextPacket(packet)).resolves.toBe(packet);
  });

  it('delegates materialization to the registered content service', async () => {
    const materialize = vi.fn(async (packet: MultimodalContextPacket) => ({
      ...packet,
      perceptionInputs: packet.perceptionInputs.map((input) => ({
        ...input,
        uri: 'resource://perception/input-1',
      })),
    }));

    const packet = await resolvePerceptionContextPacket(createPacket(), {
      workspaceRoot: '/workspace',
      materializer: { materialize },
    });

    expect(materialize).toHaveBeenCalledWith(expect.objectContaining({ id: 'ctx-perception' }), {
      workspaceRoot: '/workspace',
    });
    expect(packet.perceptionInputs[0]?.uri).toBe('resource://perception/input-1');
    expect(JSON.stringify(packet)).not.toContain('.neko/.cache');
  });
});
