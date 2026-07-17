import type { CanvasNodeType } from '@neko/shared';
import type { NodeTypeDescriptorRegistry } from '../components/nodes/nodeTypeDescriptor';

/**
 * Basic is a catalog projection over existing Canvas node descriptors. It is
 * intentionally not a persisted Canvas profile or a second node registry.
 */
export const BASIC_CANVAS_NODE_TYPES = [
  'media',
  'annotation',
  'group',
  'text',
  'artboard',
  'script',
  'document',
] as const satisfies readonly CanvasNodeType[];

export function createBasicNodeLibraryDescriptors(
  coreDescriptors: NodeTypeDescriptorRegistry,
  storyboardDescriptors: NodeTypeDescriptorRegistry,
): NodeTypeDescriptorRegistry {
  const owningDescriptors = {
    ...coreDescriptors,
    ...storyboardDescriptors,
  };
  const basicDescriptors: NodeTypeDescriptorRegistry = {};

  for (const nodeType of BASIC_CANVAS_NODE_TYPES) {
    const descriptor = owningDescriptors[nodeType];
    if (!descriptor) {
      throw new Error(`Missing owning Canvas descriptor for Basic node type "${nodeType}".`);
    }
    basicDescriptors[nodeType] = descriptor;
  }

  return basicDescriptors;
}
