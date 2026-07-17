import { describe, expect, it } from 'vitest';
import type { CutTimelineDocumentTarget, ToolResult, TimelineElementUpdate } from '@neko/shared';
import { TOOL_NAMES_TIMELINE } from '@neko/shared';
import { TimelineToolBridge, type TimelineToolRunner } from './timelineToolBridge';

class MockTimelineToolRunner implements TimelineToolRunner {
  readonly calls: Array<{
    toolName: string;
    params: Record<string, unknown>;
    target: CutTimelineDocumentTarget;
  }> = [];
  private readonly results = new Map<string, ToolResult>();

  setResult(toolName: string, result: ToolResult): void {
    this.results.set(toolName, result);
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    target: CutTimelineDocumentTarget,
  ): Promise<ToolResult> {
    this.calls.push({ toolName, params, target });
    return this.results.get(toolName) ?? { success: true, data: undefined };
  }
}

const READ_TARGET = { documentUri: 'file:///workspace/edit.nkv' } as const;
const WRITE_TARGET = {
  documentUri: 'file:///workspace/edit.nkv',
  expectedProjectRevision: 'revision-1',
} as const;

describe('TimelineToolBridge', () => {
  it('unwraps timeline info from executor results', async () => {
    const runner = new MockTimelineToolRunner();
    runner.setResult('GetTimelineInfo', {
      success: true,
      data: {
        documentUri: READ_TARGET.documentUri,
        projectRevision: 'revision-1',
        duration: 12,
        fps: 24,
        width: 1920,
        height: 1080,
        trackCount: 3,
      },
    });

    const bridge = new TimelineToolBridge(runner);
    const info = await bridge.getInfo(READ_TARGET);

    expect(info.duration).toBe(12);
    expect(runner.calls).toEqual([
      { toolName: 'GetTimelineInfo', params: {}, target: READ_TARGET },
    ]);
  });

  it('maps AddTimelineElement media types to internal AddElement payload', async () => {
    const runner = new MockTimelineToolRunner();
    runner.setResult('AddElement', {
      success: true,
      data: { elementId: 'elem-1' },
    });

    const bridge = new TimelineToolBridge(runner);
    const result = await bridge.executeAgentTool(TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT, {
      type: 'video',
      trackId: 'track-1',
      startTime: 5,
      duration: 3,
      source: '/tmp/clip.mp4',
      ...WRITE_TARGET,
    });

    expect(result.success).toBe(true);
    expect(runner.calls).toEqual([
      {
        toolName: 'AddElement',
        params: {
          trackId: 'track-1',
          type: 'media',
          startTime: 5,
          duration: 3,
          src: '/tmp/clip.mp4',
        },
        target: WRITE_TARGET,
      },
    ]);
  });

  it('expands public update payloads into executor calls', async () => {
    const runner = new MockTimelineToolRunner();
    const bridge = new TimelineToolBridge(runner);

    await bridge.updateElement(WRITE_TARGET, 'elem-1', {
      startTime: 2,
      transitionIn: { type: 'fade', duration: 0.5 },
      speed: 1.25,
    } as TimelineElementUpdate);

    expect(runner.calls).toEqual([
      {
        toolName: 'UpdateElement',
        params: { elementId: 'elem-1', startTime: 2 },
        target: WRITE_TARGET,
      },
      {
        toolName: 'SetTransition',
        params: {
          elementId: 'elem-1',
          placement: 'in',
          type: 'fade',
          duration: 0.5,
          easing: undefined,
          params: undefined,
        },
        target: WRITE_TARGET,
      },
      {
        toolName: 'SetPlaybackSpeed',
        params: { elementId: 'elem-1', speed: 1.25 },
        target: WRITE_TARGET,
      },
    ]);
  });

  it('defaults AddTrack name based on track type', async () => {
    const runner = new MockTimelineToolRunner();
    const bridge = new TimelineToolBridge(runner);

    await bridge.executeAgentTool(TOOL_NAMES_TIMELINE.ADD_TRACK, {
      type: 'audio',
      ...WRITE_TARGET,
    });

    expect(runner.calls).toEqual([
      {
        toolName: 'AddTrack',
        params: { type: 'audio', name: 'Audio' },
        target: WRITE_TARGET,
      },
    ]);
  });

  it('unwraps ListElements result payloads into API arrays', async () => {
    const runner = new MockTimelineToolRunner();
    runner.setResult('ListElements', {
      success: true,
      data: {
        elements: [{ id: 'elem-1', type: 'media', trackId: 'track-1', startTime: 0, duration: 4 }],
      },
    });

    const bridge = new TimelineToolBridge(runner);
    const elements = await bridge.listElements(READ_TARGET);

    expect(elements).toHaveLength(1);
    expect(elements[0]?.id).toBe('elem-1');
  });
});
