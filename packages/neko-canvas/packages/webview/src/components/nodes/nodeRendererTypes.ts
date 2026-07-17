import type React from 'react';
import type { CanvasNode, CanvasNodeType, CanvasViewport } from '@neko/shared';
import type { NodeTypeDescriptorRegistry } from './nodeTypeDescriptor';

export interface NodeRendererCommonProps {
  viewport: CanvasViewport;
  isSelected: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onTransformStart?: (nodeId: string) => void;
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onResize?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onRotate?: (nodeId: string, rotation: number) => void;
  onRotateEnd?: (nodeId: string, rotation: number) => void;
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  isExpanded?: boolean;
  onToggleExpand?: (nodeId: string) => void;
  interactionRenderMode?: 'full' | 'shell';
}

export interface NodeRendererContext extends NodeRendererCommonProps {
  node: CanvasNode;
  allNodes: CanvasNode[];
  selectedNodeIds: string[];
  nodeTypeDescriptors?: NodeTypeDescriptorRegistry;
  onScriptLoadScenes?: (nodeId: string, scriptPath: string) => void;
  onScriptOpen?: (scriptPath: string) => void;
  onScriptNavigateToScene?: (linkedSceneGroupId: string) => void;
  onDocumentOpen?: (docPath: string) => void;
  onCanvasEmbedOpen?: (canvasPath: string) => void;
  onModelCheckInstalled?: (nodeId: string, modelPath: string) => void;
  onRemoveContainerChild?: (containerId: string, childId: string) => void;
}

export type NodeRenderer = (context: NodeRendererContext) => React.ReactNode;

export type NodeRendererRegistry = Partial<Record<CanvasNodeType, NodeRenderer>>;
