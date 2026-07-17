import {
  BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS,
  createBuiltInCanvasSubsystemManifestRegistry,
  getBuiltInCanvasSubsystemManifest,
  type CanvasSubsystemId,
  type CanvasSubsystemManifest,
} from '@neko/shared';

export function listCanvasSubsystemManifests(): readonly CanvasSubsystemManifest[] {
  return BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS;
}

export function createCanvasSubsystemManifestRegistry(): ReadonlyMap<
  CanvasSubsystemId,
  CanvasSubsystemManifest
> {
  return createBuiltInCanvasSubsystemManifestRegistry();
}

export function getCanvasSubsystemManifest(
  id: CanvasSubsystemId,
): CanvasSubsystemManifest | undefined {
  return getBuiltInCanvasSubsystemManifest(id);
}
