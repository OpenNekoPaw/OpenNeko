import { useEffect } from 'react';
import { useCanvasStore } from '../stores/canvasStore';

export interface UseNodeExpandResult {
  expandedNodeId: string | null;
  isExpanded: (nodeId: string) => boolean;
  setExpandedNodeId: (nodeId: string | null) => void;
  toggleExpandedNode: (nodeId: string) => void;
}

/**
 * Coordinates inline node expansion so one selected node owns the expanded editor.
 */
export function useNodeExpand(): UseNodeExpandResult {
  const selectedNodeIds = useCanvasStore((state) => state.selection.nodeIds);
  const expandedNodeId = useCanvasStore((state) => state.expandedNodeId);
  const setExpandedNodeId = useCanvasStore((state) => state.setExpandedNodeId);
  const toggleExpandedNode = useCanvasStore((state) => state.toggleExpandedNode);

  useEffect(() => {
    if (!expandedNodeId) return;
    if (selectedNodeIds.length !== 1 || selectedNodeIds[0] !== expandedNodeId) {
      setExpandedNodeId(null);
    }
  }, [expandedNodeId, selectedNodeIds, setExpandedNodeId]);

  return {
    expandedNodeId,
    isExpanded: (nodeId) => expandedNodeId === nodeId,
    setExpandedNodeId,
    toggleExpandedNode,
  };
}
