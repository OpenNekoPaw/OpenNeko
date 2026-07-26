import React from 'react';
import { UnsupportedNode } from './UnsupportedNode';
import type { NodeRendererContext, NodeRendererRegistry } from './nodeRendererTypes';

export function renderCanvasNode(
  registry: NodeRendererRegistry,
  context: NodeRendererContext,
): React.ReactNode {
  const renderer = registry[context.node.type];

  return renderer ? renderer(context) : <UnsupportedNode key={context.node.id} {...context} />;
}
