import { isCanvasNodeType, type CanvasNodeType } from '@neko/shared';

export const NODE_LIBRARY_DRAG_MIME = 'application/x-neko-canvas-node';

const NODE_LIBRARY_DRAG_TEXT_PREFIX = 'neko-canvas-node:';
const NODE_LIBRARY_DRAG_KIND = 'neko-canvas.node-library';

interface NodeLibraryDragPayload {
  readonly kind: typeof NODE_LIBRARY_DRAG_KIND;
  readonly nodeType: CanvasNodeType;
}

export interface NodeLibraryDragDataTransfer {
  effectAllowed: DataTransfer['effectAllowed'];
  readonly types: Iterable<string>;
  getData(format: string): string;
  setData(format: string, data: string): void;
}

export function writeNodeLibraryDragPayload(
  dataTransfer: NodeLibraryDragDataTransfer,
  nodeType: CanvasNodeType,
): void {
  const payload: NodeLibraryDragPayload = {
    kind: NODE_LIBRARY_DRAG_KIND,
    nodeType,
  };
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(NODE_LIBRARY_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.setData('text/plain', `${NODE_LIBRARY_DRAG_TEXT_PREFIX}${nodeType}`);
}

export function hasNodeLibraryDragPayload(dataTransfer: NodeLibraryDragDataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(NODE_LIBRARY_DRAG_MIME);
}

export function readNodeLibraryDragPayload(
  dataTransfer: Pick<NodeLibraryDragDataTransfer, 'getData'>,
): CanvasNodeType | undefined {
  const payload = readStructuredNodeLibraryPayload(dataTransfer);
  if (payload) {
    return payload;
  }

  const textPayload = dataTransfer.getData('text/plain');
  if (!textPayload.startsWith(NODE_LIBRARY_DRAG_TEXT_PREFIX)) {
    return undefined;
  }

  const nodeType = textPayload.slice(NODE_LIBRARY_DRAG_TEXT_PREFIX.length);
  return isCanvasNodeType(nodeType) ? nodeType : undefined;
}

function readStructuredNodeLibraryPayload(
  dataTransfer: Pick<NodeLibraryDragDataTransfer, 'getData'>,
): CanvasNodeType | undefined {
  const rawPayload = dataTransfer.getData(NODE_LIBRARY_DRAG_MIME);
  if (!rawPayload) {
    return undefined;
  }

  try {
    const payload: unknown = JSON.parse(rawPayload);
    if (!isNodeLibraryDragPayload(payload)) {
      return undefined;
    }
    return payload.nodeType;
  } catch {
    return undefined;
  }
}

function isNodeLibraryDragPayload(value: unknown): value is NodeLibraryDragPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const payload = value as Partial<NodeLibraryDragPayload>;
  return payload.kind === NODE_LIBRARY_DRAG_KIND && isCanvasNodeType(payload.nodeType);
}
