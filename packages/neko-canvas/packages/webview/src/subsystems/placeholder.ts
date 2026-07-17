import { getBuiltInCanvasSubsystemManifest } from '@neko/shared';
import {
  createPlaceholderNodeTypeDescriptors,
  type PlaceholderSubsystemId,
} from './placeholderDescriptors';
import { createPlaceholderNodeRendererRegistry } from './placeholderRenderers';
import type { WebviewSubsystemRegistration } from './types';

export function createPlaceholderSubsystemRegistration(
  id: PlaceholderSubsystemId,
): WebviewSubsystemRegistration {
  const manifest = getBuiltInCanvasSubsystemManifest(id);

  if (!manifest) {
    throw new Error(`Missing built-in ${id} Canvas subsystem manifest`);
  }

  const registration = {
    manifest,
    nodeTypeDescriptors: createPlaceholderNodeTypeDescriptors(id),
  };

  return {
    ...registration,
    nodeRenderers: createPlaceholderNodeRendererRegistry(id),
  };
}
