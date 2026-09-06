import type { CanvasNode } from '../types/canvas';

const CANVAS_LAYOUT_COLUMN_GAP = 16;
const CANVAS_LAYOUT_VERTICAL_GAP = 16;
const CANVAS_LAYOUT_COLUMNS = 5;

export function findAvailableCanvasNodePosition(
  preferred: CanvasNode['position'],
  size: CanvasNode['size'],
  existingNodes: readonly CanvasNode[],
): CanvasNode['position'] {
  let y = preferred.y;
  while (true) {
    let nextY = y;
    for (let column = 0; column < CANVAS_LAYOUT_COLUMNS; column += 1) {
      const position = {
        x: preferred.x + column * (size.width + CANVAS_LAYOUT_COLUMN_GAP),
        y,
      };
      const intersecting = existingNodes.filter((node) =>
        canvasNodeRectanglesOverlap({ position, size }, node),
      );
      if (intersecting.length === 0) return position;
      nextY = Math.max(
        nextY,
        ...intersecting.map(
          (node) => node.position.y + node.size.height + CANVAS_LAYOUT_VERTICAL_GAP,
        ),
      );
    }
    y = nextY > y ? nextY : y + size.height + CANVAS_LAYOUT_VERTICAL_GAP;
  }
}

function canvasNodeRectanglesOverlap(
  left: Pick<CanvasNode, 'position' | 'size'>,
  right: Pick<CanvasNode, 'position' | 'size'>,
): boolean {
  return !(
    left.position.x + left.size.width <= right.position.x ||
    right.position.x + right.size.width <= left.position.x ||
    left.position.y + left.size.height <= right.position.y ||
    right.position.y + right.size.height <= left.position.y
  );
}
