import React from 'react';
import { UnsupportedNode } from './UnsupportedNode';
import { NodeContentDispatcher } from '../content/NodeContentDispatcher';
import type { NodeRendererContext, NodeRendererRegistry } from './nodeRendererTypes';

export function renderCanvasNode(
  registry: NodeRendererRegistry,
  context: NodeRendererContext,
): React.ReactNode {
  const renderer = registry[context.node.type];

  return (
    <NodeContentDispatcher
      context={context}
      renderDefaultNode={(defaultContext) =>
        renderer ? (
          renderer(defaultContext)
        ) : (
          <UnsupportedNode key={context.node.id} {...defaultContext} />
        )
      }
    />
  );
}
