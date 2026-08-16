import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasData } from '@neko/canvas-domain';
import { useCanvasStore } from '../canvasStore';
import { DEFAULT_RUNTIME_VIEWPORT, useRuntimeViewportStore } from '../runtimeViewportStore';

const DOCUMENT_VIEWPORT = {
  pan: { x: 100, y: 200 },
  zoom: 1.5,
};

function createCanvasData(): CanvasData {
  return {
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

  it('does not reseed an active viewport for another snapshot of the same document', () => {
    useRuntimeViewportStore.getState().seedViewportFromDocument('doc-a', DOCUMENT_VIEWPORT);
    useRuntimeViewportStore.getState().setViewport({
      pan: { x: 480, y: 320 },
      zoom: 0.9,
    });

    useRuntimeViewportStore.getState().seedViewportFromDocument('doc-a', {
      pan: { x: 0, y: 0 },
      zoom: 1,
    });

    expect(useRuntimeViewportStore.getState().viewport).toEqual({
      pan: { x: 480, y: 320 },
      zoom: 0.9,
    });
  });

  it('seeds a different document identity from its presentation snapshot', () => {
    useRuntimeViewportStore.getState().seedViewportFromDocument('doc-a', DOCUMENT_VIEWPORT);

    const nextDocumentViewport = { pan: { x: -40, y: 80 }, zoom: 1.25 };
    useRuntimeViewportStore.getState().seedViewportFromDocument('doc-b', nextDocumentViewport);

    expect(useRuntimeViewportStore.getState().viewport).toEqual(nextDocumentViewport);
    expect(useRuntimeViewportStore.getState().seededDocumentKey).toBe('doc-b');
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
