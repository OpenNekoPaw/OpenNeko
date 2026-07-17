import { describe, expect, it, vi } from 'vitest';
import type { MultimodalContextPacket } from '@neko/shared';
import type { TimelineContextEditorLike } from '../turn/timeline-context-runtime';
import { createTimelineContextRuntime } from '../turn/timeline-context-runtime';

function createTimelineEditor(
  overrides: Partial<{
    hasTimeline: boolean;
    elementIds: readonly string[];
    trackId: string;
    currentTime: number;
  }> = {},
): TimelineContextEditorLike {
  return {
    capabilities: { hasTimeline: overrides.hasTimeline ?? true },
    getSelection: () => ({
      elementIds: overrides.elementIds ?? ['clip-1'],
      ...(overrides.trackId ? { trackId: overrides.trackId } : {}),
    }),
    getState: () => ({
      ...(overrides.currentTime !== undefined ? { currentTime: overrides.currentTime } : {}),
    }),
    getContent: <T = unknown>() => ({}) as T,
  };
}

describe('timeline-context-runtime', () => {
  it('returns null when active editor does not support timeline', async () => {
    const getPerceptionMaterializer = vi.fn();
    const runtime = createTimelineContextRuntime({ getPerceptionMaterializer });

    await expect(
      runtime.build({
        activeEditor: createTimelineEditor({ hasTimeline: false }),
        message: 'inspect clip',
        workspaceRoot: '/workspace',
      }),
    ).resolves.toBeNull();
    expect(getPerceptionMaterializer).not.toHaveBeenCalled();
  });

  it('builds a timeline context packet from editor selection and state', async () => {
    const runtime = createTimelineContextRuntime();

    const packet = await runtime.build({
      activeEditor: createTimelineEditor({
        elementIds: ['clip-1'],
        trackId: 'track-a',
        currentTime: 12.5,
      }),
      message: 'describe selected clip',
      workspaceRoot: '/workspace',
    });

    expect(packet).toEqual(
      expect.objectContaining({
        uiContext: expect.objectContaining({
          activePanel: 'timeline',
          selectionIds: ['sel-timeline-clip-1'],
          userAnnotation: 'describe selected clip',
          timeline: expect.objectContaining({
            activeTrackId: 'track-a',
            playheadMs: 12500,
          }),
        }),
      }),
    );
  });

  it('passes packets through when no perception materializer is registered', async () => {
    const runtime = createTimelineContextRuntime();

    const packet = await runtime.build({
      activeEditor: createTimelineEditor(),
      message: 'inspect clip',
    });

    expect(packet).not.toBeNull();
    expect(JSON.stringify(packet)).not.toContain('.neko/.cache');
  });

  it('delegates perception materialization to the registered content service', async () => {
    const materialize = vi.fn(async (packet: MultimodalContextPacket) => ({
      ...packet,
      perceptionInputs: packet.perceptionInputs.map((input) => ({
        ...input,
        metadata: { ...input.metadata, materializedBy: 'content-service' },
      })),
    }));
    const getPerceptionMaterializer = vi.fn(async () => ({ materialize }));
    const runtime = createTimelineContextRuntime({ getPerceptionMaterializer });

    const packet = await runtime.build({
      activeEditor: createTimelineEditor(),
      message: 'inspect clip',
      workspaceRoot: '/workspace',
    });

    expect(packet).not.toBeNull();
    expect(getPerceptionMaterializer).toHaveBeenCalledOnce();
    expect(materialize).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.stringMatching(/^ctx-timeline-/) }),
      { workspaceRoot: '/workspace' },
    );
    expect(packet?.perceptionInputs[0]?.metadata).toEqual(
      expect.objectContaining({ materializedBy: 'content-service' }),
    );
  });
});
