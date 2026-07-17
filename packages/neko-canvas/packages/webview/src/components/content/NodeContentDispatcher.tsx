import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CanvasNode, ContainerSection, FieldBinding } from '@neko/shared';
import { getDefaultCanvasNodePresetName, writeFieldBinding } from '@neko/shared';
import { BaseNode } from '../nodes/BaseNode';
import { NodeShell } from './NodeShell';
import type {
  FieldBindingUpdate,
  NodeContentDensity,
  NodeContentLayoutContext,
  NodeContentRenderContext,
} from './types';
import type { NodeRendererContext } from '../nodes/nodeRendererTypes';
import {
  createBuiltInCanvasNodePresetRegistry,
  getCanvasNodePreset,
} from '../../utils/canvasPresetRegistry';
import type { CanvasNodeDraft } from '../../utils/canvasPresetRegistry';
import { useCanvasStore } from '../../stores/canvasStore';
import { clampNodeSize, resolveNodeMinSize } from '../../utils/nodeSizing';
import { createBuiltInNodeTypeDescriptors } from '../nodes/nodeTypeDescriptors';

export type DefaultNodeRenderer = (context: NodeRendererContext) => React.ReactNode;

export interface NodeContentDispatcherProps {
  context: NodeRendererContext;
  renderDefaultNode?: DefaultNodeRenderer;
}

const PRESET_REGISTRY = createBuiltInCanvasNodePresetRegistry();
const NODE_TYPE_DESCRIPTORS = createBuiltInNodeTypeDescriptors();
const COLLAPSED_NODE_RENDER_HEIGHT = 42;
const SHOT_CANVAS_REVIEW_CONTENT: ContainerSection = {
  id: 'shot-canvas-review-root',
  layout: 'stack',
  metadata: { presentation: 'shot-canvas-review' },
};

export function NodeContentDispatcher({ context, renderDefaultNode }: NodeContentDispatcherProps) {
  const { node } = context;

  const content = useMemo(() => resolveContent(node), [node]);
  const renderContent = useMemo(() => resolveCanvasRenderContent(node, content), [content, node]);

  if (!renderContent) {
    return renderDefaultNode ? <>{renderDefaultNode(context)}</> : null;
  }

  return <ComposableNodeContent context={context} node={node} content={renderContent} />;
}

function resolveContent(node: CanvasNode): ContainerSection | undefined {
  const presetName = node.preset ?? getDefaultCanvasNodePresetName(node.type);
  const preset = getCanvasNodePreset(PRESET_REGISTRY, presetName);
  if (preset && preset.nodeType === node.type) {
    return preset.createContent(node as CanvasNodeDraft);
  }

  if (node.content) return node.content;

  return undefined;
}

function resolveCanvasRenderContent(
  node: CanvasNode,
  content: ContainerSection | undefined,
): ContainerSection | undefined {
  if (node.type === 'group') {
    return undefined;
  }
  if (node.type === 'shot') {
    return SHOT_CANVAS_REVIEW_CONTENT;
  }
  return content;
}

function ComposableNodeContent({
  context,
  node,
  content,
}: {
  context: NodeRendererContext;
  node: CanvasNode;
  content: NonNullable<CanvasNode['content']>;
}) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const openContentOverlay = useCanvasStore((s) => s.openContentOverlay);
  const [isCollapsed, setIsCollapsed] = useState(() => node.container?.collapsed ?? false);

  useEffect(() => {
    setIsCollapsed(node.container?.collapsed ?? false);
  }, [node.id, node.container?.collapsed]);

  const handleUpdateBinding = useCallback(
    (update: FieldBindingUpdate) => {
      const binding: FieldBinding = { path: update.path as FieldBinding['path'] };
      const result = writeFieldBinding(node.data, binding, update.value);
      if (result.changed && isRecord(result.data)) {
        context.onUpdateData?.(node.id, result.data);
      }
    },
    [context, node],
  );

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((current) => {
      const next = !current;
      const updates = createNodeCollapseUpdate(node, next);
      if (updates) {
        updateNode(node.id, updates);
      }
      return next;
    });
  }, [node, updateNode]);

  const renderContext: NodeContentRenderContext = {
    node,
    allNodes: context.allNodes,
    selectedNodeIds: context.selectedNodeIds,
    nodeTypeDescriptors: context.nodeTypeDescriptors,
    isSelected: context.isSelected,
    isExpanded: context.isExpanded,
    layout: createNodeLayoutContext(node),
    depth: 0,
    previewSurfaceKind: 'inline',
    interactionRenderMode: context.interactionRenderMode ?? 'full',
    onUpdateBinding: handleUpdateBinding,
    onUpdateNodeData: context.onUpdateData,
    onSelectNode: context.onSelect,
    onRemoveChild: context.onRemoveContainerChild,
  };
  const presentation =
    context.nodeTypeDescriptors?.[node.type]?.presentation ??
    NODE_TYPE_DESCRIPTORS[node.type]?.presentation ??
    'structured';

  return (
    <BaseNode
      node={node}
      viewport={context.viewport}
      isSelected={context.isSelected}
      containerRef={context.containerRef}
      onSelect={context.onSelect}
      onTransformStart={context.onTransformStart}
      onDrag={context.onDrag}
      onMove={context.onMove}
      onResize={context.onResize}
      onResizeEnd={context.onResizeEnd}
      onRotate={context.onRotate}
      onRotateEnd={context.onRotateEnd}
      onConnectionStart={context.onConnectionStart}
      autoSizeContent={false}
      renderHeight={isCollapsed ? COLLAPSED_NODE_RENDER_HEIGHT : undefined}
      presentation={presentation}
      onActivate={presentation === 'foundational' ? openContentOverlay : undefined}
    >
      <NodeShell
        section={content}
        context={renderContext}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />
    </BaseNode>
  );
}

export function createNodeCollapseUpdate(
  node: CanvasNode,
  collapsed: boolean,
): Pick<CanvasNode, 'container'> | undefined {
  if (!node.container) {
    return undefined;
  }
  return {
    container: {
      ...node.container,
      collapsed,
    },
  };
}

function createNodeLayoutContext(node: CanvasNode): NodeContentLayoutContext {
  const { width, height } = clampNodeSize(node.size, resolveNodeMinSize(node));
  const density = resolveNodeDensity(width, height);

  return {
    width,
    height,
    density,
    surface: 'canvas',
    overflow: 'scroll',
  };
}

function resolveNodeDensity(width: number, height: number): NodeContentDensity {
  if (width < 360 || height < 220) {
    return 'compact';
  }

  if (width >= 720 && height >= 420) {
    return 'expanded';
  }

  return 'comfortable';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
