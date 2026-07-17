import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasData } from '@neko/shared';
import { useCanvasStore } from '../canvasStore';
import { DEFAULT_RUNTIME_VIEWPORT, useRuntimeViewportStore } from '../runtimeViewportStore';

const DOCUMENT_VIEWPORT = {
  pan: { x: 100, y: 200 },
  zoom: 1.5,
};

function createCanvasData(): CanvasData {
  return {
    version: '1.0',
    name: 'Viewport Test',
    viewport: DOCUMENT_VIEWPORT,
    nodes: [],
    connections: [],
  };
}

describe('runtime viewport store', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      canvasData: createCanvasData(),
      selection: { nodeIds: [], connectionIds: [] },
      isConnecting: false,
      pendingConnectionSource: null,
      activePlayingNodeId: null,
      expandedNodeId: null,
      generationPanelState: { visible: false, nodeId: null },
      contentOverlayState: { visible: false, nodeId: null },
    });
    useRuntimeViewportStore.setState({
      viewport: DEFAULT_RUNTIME_VIEWPORT,
      seededDocumentKey: null,
    });
  });

  it('seeds runtime viewport from loaded canvas data', () => {
    useRuntimeViewportStore
      .getState()
      .seedViewportFromDocument('doc-a', useCanvasStore.getState().canvasData!.viewport!);

    expect(useRuntimeViewportStore.getState().viewport).toEqual(DOCUMENT_VIEWPORT);
    expect(useRuntimeViewportStore.getState().seededDocumentKey).toBe('doc-a');
  });

  it('updates pan and zoom without mutating semantic canvas data', () => {
    const before = useCanvasStore.getState().canvasData;

    useRuntimeViewportStore.getState().setViewport({ pan: { x: 400, y: 500 } });
    useRuntimeViewportStore.getState().zoomCanvas(2);

    expect(useRuntimeViewportStore.getState().viewport).toEqual({
      pan: { x: 400, y: 500 },
      zoom: 2,
    });
    expect(useCanvasStore.getState().canvasData).toBe(before);
    expect(useCanvasStore.getState().canvasData?.viewport).toEqual(DOCUMENT_VIEWPORT);
  });

  it('resets runtime viewport without mutating canvas document viewport', () => {
    useRuntimeViewportStore.getState().seedViewportFromDocument('doc-a', DOCUMENT_VIEWPORT);
    useRuntimeViewportStore.getState().resetViewport();

    expect(useRuntimeViewportStore.getState().viewport).toEqual(DEFAULT_RUNTIME_VIEWPORT);
    expect(useCanvasStore.getState().canvasData?.viewport).toEqual(DOCUMENT_VIEWPORT);
  });
});
