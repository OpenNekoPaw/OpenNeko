import { describe, expect, it, vi } from 'vitest';
import { createSourceModelViewerHost } from './sourceModelViewerHost';

describe('source Model Viewer host', () => {
  it('projects one source session into the existing ModelViewer protocol', async () => {
    const host = createSourceModelViewerHost({
      sessionId: 'session-1',
      source: {
        source: { kind: 'workspace-file', path: 'models/descriptor-1.glb' },
        sourceFingerprint: 'revision-1',
        format: 'glb',
        entryUri: 'neko-media://desktop/descriptor-1',
        uriMap: { 'model.glb': 'neko-media://desktop/descriptor-1' },
        sizeBytes: 100,
      },
    });
    const listener = vi.fn();
    host.subscribe(listener);

    host.postMessage({
      type: '3d-reference/ready',
      protocolVersion: 2,
      sessionId: 'session-1',
    });
    await Promise.resolve();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: '3d-reference/session-init',
        panelSubject: expect.objectContaining({ kind: 'source-model' }),
        staging: expect.objectContaining({ sessionId: 'session-1' }),
      }),
    );
    expect(() =>
      host.postMessage({
        type: '3d-reference/capture-requested',
      }),
    ).toThrow("does not implement '3d-reference/capture-requested'");
    expect(() => host.postMessage({ type: 'unknown' })).toThrow("unknown Host message 'unknown'");
  });

  it('restarts source initialization after a StrictMode effect cleanup', async () => {
    const host = createSourceModelViewerHost({
      sessionId: 'session-strict',
      source: {
        source: { kind: 'workspace-file', path: 'models/descriptor-strict.glb' },
        sourceFingerprint: 'revision-strict',
        format: 'glb',
        entryUri: 'neko-media://desktop/descriptor-strict',
        uriMap: { 'model.glb': 'neko-media://desktop/descriptor-strict' },
        sizeBytes: 100,
      },
    });
    const firstListener = vi.fn();
    const disposeFirst = host.subscribe(firstListener);
    host.postMessage({
      type: '3d-reference/ready',
      protocolVersion: 2,
      sessionId: 'session-strict',
    });
    disposeFirst();

    const secondListener = vi.fn();
    host.subscribe(secondListener);
    host.postMessage({
      type: '3d-reference/ready',
      protocolVersion: 2,
      sessionId: 'session-strict',
    });
    await Promise.resolve();

    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).toHaveBeenCalledOnce();
    expect(secondListener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: '3d-reference/session-init',
        staging: expect.objectContaining({ sessionId: 'session-strict' }),
      }),
    );
  });
});
