import type { CanvasBlock, CanvasNode, ContainerSection } from '@neko/shared';
import type { NodeTypeDescriptorRegistry } from '../nodes/nodeTypeDescriptor';

export type NodeContentDensity = 'compact' | 'comfortable' | 'expanded';

export type NodeContentSurface = 'canvas' | 'container-card' | 'overlay';

export type NodeContentOverflow = 'clip' | 'scroll' | 'summary';

export type NodeContentChrome = 'contained' | 'full-bleed';

export interface NodeContentLayoutContext {
  width: number;
  height: number;
  density: NodeContentDensity;
  surface: NodeContentSurface;
  overflow: NodeContentOverflow;
}

export interface FieldBindingUpdate {
  path: string;
  value: unknown;
}

export interface NodeContentRenderContext {
  node: CanvasNode;
  allNodes: CanvasNode[];
  selectedNodeIds: string[];
  nodeTypeDescriptors?: NodeTypeDescriptorRegistry;
  isSelected: boolean;
  isExpanded?: boolean;
  layout: NodeContentLayoutContext;
  depth: number;
  contentChrome?: NodeContentChrome;
  previewSurfaceKind?: 'inline' | 'overlay';
  interactionRenderMode?: 'full' | 'shell';
  onUpdateBinding?: (update: FieldBindingUpdate) => void;
  onUpdateNodeData?: (nodeId: string, data: Record<string, unknown>) => void;
  onSelectNode?: (nodeId: string, multi: boolean) => void;
  onRemoveChild?: (containerId: string, childId: string) => void;
}

export interface ContainerRendererProps {
  section: ContainerSection;
  context: NodeContentRenderContext;
}

export interface BlockRendererContext extends NodeContentRenderContext {
  block: CanvasBlock;
}

export type BlockRenderer = (context: BlockRendererContext) => React.ReactNode;

export type BlockRendererRegistry = Partial<Record<CanvasBlock['kind'], BlockRenderer>>;
