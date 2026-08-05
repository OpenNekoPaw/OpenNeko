import { describe, expect, it, vi } from 'vitest';
import { createSourceModelViewerHost } from './sourceModelViewerHost';

describe('source Model Viewer host', () => {
  it('projects one source session into the existing ModelViewer protocol', async () => {
    const host = createSourceModelViewerHost({
      sessionId: 'session-1',
      source: {
        source: { kind: 'workspace-file', path: 'models/descriptor-1.glb' },
        sourceFingerprint: 'fingerprint-1',
        format: 'glb',
        entryUri: 'http://127.0.0.1:43125/v1/resources/descriptor-1',
        uriMap: {
          'model.glb': 'http://127.0.0.1:43125/v1/resources/descriptor-1',
        },
        sizeBytes: 100,
      },
    });
    const listener = vi.fn();
    host.subscribe(listener);

    host.postMessage({
      type: '3d-reference/ready',
      identity: { sessionId: 'session-1', requestId: 'ready-1' },
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
        sourceFingerprint: 'fingerprint-strict',
        format: 'glb',
        entryUri: 'http://127.0.0.1:43125/v1/resources/descriptor-strict',
        uriMap: {
          'model.glb': 'http://127.0.0.1:43125/v1/resources/descriptor-strict',
        },
        sizeBytes: 100,
      },
    });
    const firstListener = vi.fn();
    const disposeFirst = host.subscribe(firstListener);
    host.postMessage({
      type: '3d-reference/ready',
      identity: { sessionId: 'session-strict', requestId: 'ready-first' },
    });
    disposeFirst();

    const secondListener = vi.fn();
    host.subscribe(secondListener);
    host.postMessage({
      type: '3d-reference/ready',
      identity: { sessionId: 'session-strict', requestId: 'ready-second' },
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

  it('reports invalid stored staging only to its panel and leaves sibling state untouched', async () => {
    const invalidHost = createHost('invalid-panel', 'invalid.glb', 'fingerprint-invalid');
    const siblingHost = createHost('sibling-panel', 'sibling.glb', 'fingerprint-sibling');
    const invalidState = { threeReferenceStaging: { sessionId: 'another-panel' } };
    invalidHost.setState(invalidState);
    const invalidListener = vi.fn();
    const siblingListener = vi.fn();
    invalidHost.subscribe(invalidListener);
    siblingHost.subscribe(siblingListener);

    invalidHost.postMessage({
      type: '3d-reference/ready',
      identity: { sessionId: 'invalid-panel', requestId: 'invalid-ready' },
    });
    siblingHost.postMessage({
      type: '3d-reference/ready',
      identity: { sessionId: 'sibling-panel', requestId: 'sibling-ready' },
    });
    await Promise.resolve();

    expect(invalidHost.getState()).toBe(invalidState);
    expect(invalidListener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: '3d-reference/diagnostic',
        identity: { sessionId: 'invalid-panel', requestId: 'invalid-ready' },
        diagnostic: expect.objectContaining({ code: 'staging-invalid' }),
      }),
    );
    expect(siblingListener).toHaveBeenCalledOnce();
    expect(siblingListener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: '3d-reference/session-init',
        identity: { sessionId: 'sibling-panel', requestId: 'sibling-ready' },
      }),
    );
  });
});

function createHost(sessionId: string, path: string, sourceFingerprint: string) {
  return createSourceModelViewerHost({
    sessionId,
    source: {
      source: { kind: 'workspace-file', path: `models/${path}` },
      sourceFingerprint,
      format: 'glb',
      entryUri: `openneko://resource/${'a'.repeat(32)}`,
      uriMap: { [path]: `openneko://resource/${'a'.repeat(32)}` },
      sizeBytes: 100,
    },
  });
}
