import type { NodeTypeDescriptorRegistry } from './nodeTypeDescriptor';
import { createCoreNodeTypeDescriptors } from './coreNodeTypeDescriptors';

export function createBuiltInNodeTypeDescriptors(): NodeTypeDescriptorRegistry {
  return createCoreNodeTypeDescriptors();
}
