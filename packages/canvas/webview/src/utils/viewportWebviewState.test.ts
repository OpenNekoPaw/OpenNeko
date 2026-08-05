import { describe, expect, it, vi } from 'vitest';
import type { CanvasViewport } from '@neko/canvas-domain';
import {
  createCanvasViewportSnapshotKey,
  readCanvasViewportSnapshot,
  writeCanvasViewportSnapshot,
} from './viewportWebviewState';

const VIEWPORT_A: CanvasViewport = {
  pan: { x: 12, y: 24 },
  zoom: 1.5,
};

const VIEWPORT_B: CanvasViewport = {
  pan: { x: -100, y: 80 },
  zoom: 0.75,
};

describe('viewport webview state', () => {
  it('uses a stable canvas document identity key for viewport snapshots', () => {
    expect(createCanvasViewportSnapshotKey('canvas-document-1')).toBe('canvas-document-1');
  });

  it('writes and reads viewport snapshots without dropping unrelated webview state', () => {
    let state: unknown = { panel: { visible: true } };
    const api = {
      getState: vi.fn(() => state),
      setState: vi.fn((next: unknown) => {
        state = next;
      }),
    };

    writeCanvasViewportSnapshot(api, 'doc-a', VIEWPORT_A);
    writeCanvasViewportSnapshot(api, 'doc-b', VIEWPORT_B);

    expect(readCanvasViewportSnapshot(api, 'doc-a')).toEqual(VIEWPORT_A);
    expect(readCanvasViewportSnapshot(api, 'doc-b')).toEqual(VIEWPORT_B);
    expect(state).toMatchObject({
      panel: { visible: true },
      canvasViewportSnapshots: {
        'doc-a': VIEWPORT_A,
        'doc-b': VIEWPORT_B,
      },
    });
  });

  it('reports only a malformed viewport snapshot and keeps valid siblings readable', () => {
    const reportStateDiagnostic = vi.fn();
    const api = {
      getState: () => ({
        canvasViewportSnapshots: {
          valid: VIEWPORT_A,
          invalid: { pan: { x: Number.NaN, y: 0 }, zoom: 1 },
        },
      }),
      setState: vi.fn(),
      reportStateDiagnostic,
    };

    expect(readCanvasViewportSnapshot(api, 'valid')).toEqual(VIEWPORT_A);
    expect(readCanvasViewportSnapshot(api, 'invalid')).toBeUndefined();
    expect(reportStateDiagnostic).toHaveBeenCalledWith({
      code: 'invalid-viewport-snapshot',
      message: "Canvas viewport snapshot 'invalid' is invalid.",
      documentId: 'invalid',
    });
  });

  it('preserves malformed sibling bytes when writing another document snapshot', () => {
    let state: unknown = {
      canvasViewportSnapshots: {
        invalid: { unsupportedField: 7, pan: null },
      },
    };
    const api = {
      getState: () => state,
      setState: vi.fn((next: unknown) => {
        state = next;
      }),
    };

    writeCanvasViewportSnapshot(api, 'valid', VIEWPORT_A);

    expect(state).toEqual({
      canvasViewportSnapshots: {
        invalid: { unsupportedField: 7, pan: null },
        valid: VIEWPORT_A,
      },
    });
  });
});
