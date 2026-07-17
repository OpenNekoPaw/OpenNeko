import { describe, expect, it } from 'vitest';
import {
  hasNodeLibraryDragPayload,
  NODE_LIBRARY_DRAG_MIME,
  readNodeLibraryDragPayload,
  type NodeLibraryDragDataTransfer,
  writeNodeLibraryDragPayload,
} from './nodeLibraryDrag';

describe('node library drag payload', () => {
  it('writes and reads a canvas node type payload', () => {
    const dataTransfer = createDataTransferStub();

    writeNodeLibraryDragPayload(dataTransfer, 'state');

    expect(hasNodeLibraryDragPayload(dataTransfer)).toBe(true);
    expect(dataTransfer.getData(NODE_LIBRARY_DRAG_MIME)).toContain('"nodeType":"state"');
    expect(readNodeLibraryDragPayload(dataTransfer)).toBe('state');
  });

  it('ignores invalid node type payloads', () => {
    const dataTransfer = createDataTransferStub();
    dataTransfer.setData(
      NODE_LIBRARY_DRAG_MIME,
      JSON.stringify({ kind: 'neko-canvas.node-library', nodeType: 'missing-node' }),
    );

    expect(readNodeLibraryDragPayload(dataTransfer)).toBeUndefined();
  });
});

function createDataTransferStub(): NodeLibraryDragDataTransfer {
  const values = new Map<string, string>();
  return {
    effectAllowed: 'uninitialized',
    get types() {
      return [...values.keys()];
    },
    getData(format: string) {
      return values.get(format) ?? '';
    },
    setData(format: string, data: string) {
      values.set(format, data);
    },
  };
}
