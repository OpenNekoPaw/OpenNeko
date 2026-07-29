import { describe, expect, it, vi } from 'vitest';
import type { CanvasData, CanvasViewport } from '@neko/shared';
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
    expect(createCanvasViewportSnapshotKey(createCanvas('Storyboard', '1.0'))).toBe(
      'Storyboard:1.0',
    );
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

  it('ignores malformed persisted viewport snapshots', () => {
    const api = {
      getState: () => ({
        canvasViewportSnapshots: {
          valid: VIEWPORT_A,
          invalid: { pan: { x: Number.NaN, y: 0 }, zoom: 1 },
        },
      }),
      setState: vi.fn(),
    };

    expect(readCanvasViewportSnapshot(api, 'valid')).toEqual(VIEWPORT_A);
    expect(readCanvasViewportSnapshot(api, 'invalid')).toBeUndefined();
  });
});

function createCanvas(name: string, version: string): CanvasData {
  return {
    version,
    name,
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [],
    connections: [],
  };
}
