const SELECTION_TOOLBAR_HEIGHT = 38;
const SELECTION_TOOLBAR_NODE_GAP = 4;
const CANVAS_NODE_LABEL_TOP_OFFSET = 24;
const SELECTION_TOOLBAR_LABEL_GAP = 6;

export function resolveSelectionToolbarTop(
  nodeTop: number,
  zoom: number,
  reservesExternalLabel: boolean,
): number {
  const attachmentGap = reservesExternalLabel
    ? CANVAS_NODE_LABEL_TOP_OFFSET * zoom + SELECTION_TOOLBAR_LABEL_GAP
    : SELECTION_TOOLBAR_NODE_GAP;
  return nodeTop - SELECTION_TOOLBAR_HEIGHT - attachmentGap;
}
