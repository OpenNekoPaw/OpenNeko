import type React from 'react';
import type { ContentLocator } from '@neko/content';
import type { CanvasNode, CanvasNodeType, CanvasViewport } from '@neko/canvas-domain';
import type { NodeTypeDescriptorRegistry } from './nodeTypeDescriptor';
import type { ConnectionDragTargetState } from '../../hooks/useConnectionDrag';

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
  isConnecting?: boolean;
  connectionTargetState?: ConnectionDragTargetState | null;
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  onEmbeddedPreview?: (nodeId: string, outputId?: string) => void;
  interactionRenderMode?: 'full' | 'shell';
}

export interface NodeRendererContext extends NodeRendererCommonProps {
  node: CanvasNode;
  allNodes: CanvasNode[];
  selectedNodeIds: string[];
  nodeTypeDescriptors?: NodeTypeDescriptorRegistry;
  onDocumentOpen?: (locator: ContentLocator) => void;
  onCanvasEmbedOpen?: (canvasPath: string) => void;
}

export type NodeRenderer = (context: NodeRendererContext) => React.ReactNode;

export type NodeRendererRegistry = Partial<Record<CanvasNodeType, NodeRenderer>>;
