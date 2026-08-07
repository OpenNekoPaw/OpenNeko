import { describe, expect, it, vi } from 'vitest';

import type { CutHostRuntimeResult } from '@neko/cut-domain';
import { deliverCutAgentContext } from './app-host';

describe('Desktop Cut to Agent context composition', () => {
  it('delegates the package projection to the exact Agent owner without target fallback', async () => {
    const injectContext = vi.fn(async () => undefined);
    const result = fixtureResult();

    await deliverCutAgentContext(result, 'window-1', { injectContext });

    expect(injectContext).toHaveBeenCalledWith({
      windowId: 'window-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      payload:
        result.output && result.output.type === 'agent-context' ? result.output.payload : undefined,
    });
    await expect(
      deliverCutAgentContext(result, 'window-forged', { injectContext }),
    ).rejects.toThrow('another Desktop Window');
    expect(injectContext).toHaveBeenCalledOnce();
  });
});

function fixtureResult(): CutHostRuntimeResult {
  return {
    snapshot: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'cut-view-1',
        viewInstanceId: 'view-instance-1',
        documentId: 'cuts/story.otio',
        sessionId: 'cut-session-1',
        rendererSessionId: 'endpoint-1',
      },
      dirty: false,
      document: {},
      playback: {},
      export: { tasks: [] },
      presentation: {
        playheadSeconds: 0,
        previewVolume: 1,
        previewMuted: false,
        pixelsPerSecond: 80,
        snappingEnabled: true,
        overviewVisible: true,
      },
    },
    output: {
      type: 'agent-context',
      payload: {
        type: 'cut-clip',
        id: 'cut:clip-1',
        label: 'Clip 1',
        summary: 'Explicit Clip 1',
        data: { documentId: 'cuts/story.otio', clipId: 'clip-1' },
      },
    },
  };
}
