import React from 'react';
import { validateNkcNodeContent } from '@neko/canvas-domain';
import { UnsupportedNode } from './UnsupportedNode';
import type { NodeRendererContext, NodeRendererRegistry } from './nodeRendererTypes';

export function renderCanvasNode(
  registry: NodeRendererRegistry,
  context: NodeRendererContext,
): React.ReactNode {
  const contentValidation = validateNkcNodeContent(context.node);
  if (!contentValidation.valid) {
    return (
      <UnsupportedNode
        key={context.node.id}
        {...context}
        diagnostic={contentValidation.errors.map((error) => error.message).join('; ')}
      />
    );
  }
  const renderer = registry[context.node.type];

  return renderer ? renderer(context) : <UnsupportedNode key={context.node.id} {...context} />;
}
