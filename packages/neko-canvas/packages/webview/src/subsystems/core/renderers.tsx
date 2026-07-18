import { GroupNode } from '../../components/nodes/GroupNode';
import type { NodeRendererRegistry } from '../../components/nodes/nodeRendererTypes';

export function createCoreNodeRendererRegistry(): NodeRendererRegistry {
  return {
    group: ({ node, allNodes, ...commonProps }) => {
      if (node.type !== 'group') {
        throw new Error(`Core Group renderer received node type "${node.type}".`);
      }
      return <GroupNode key={node.id} node={node} allNodes={allNodes} {...commonProps} />;
    },
  };
}
