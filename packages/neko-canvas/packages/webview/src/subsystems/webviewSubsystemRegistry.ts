import {
  BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS,
  summarizeCanvasSubsystems,
  type CanvasData,
  type CanvasNodeType,
  type CanvasSubsystemId,
  type CanvasSubsystemManifest,
} from '@neko/shared';
import { createCoreNodeTypeDescriptors } from './core/descriptors';
import { createCoreNodeRendererRegistry } from './core/renderers';
import type { NodeTypeDescriptorRegistry } from '../components/nodes/nodeTypeDescriptor';
import type { NodeRendererRegistry } from '../components/nodes/nodeRendererTypes';
import type { WebviewSubsystemLoader, WebviewSubsystemRegistration } from './types';

export interface WebviewSubsystemRegistry {
  readonly manifests: readonly CanvasSubsystemManifest[];
  getActiveSubsystems(canvas: Pick<CanvasData, 'nodes'>): readonly CanvasSubsystemId[];
  getNodeTypeSummary(canvas: Pick<CanvasData, 'nodes'>): Readonly<Record<string, number>>;
  getManifest(id: CanvasSubsystemId): CanvasSubsystemManifest | undefined;
  getSubsystemForNodeType(type: CanvasNodeType): CanvasSubsystemManifest | undefined;
  getCoreNodeRenderers(): NodeRendererRegistry;
  getCoreNodeTypeDescriptors(): NodeTypeDescriptorRegistry;
  load(id: CanvasSubsystemId): Promise<WebviewSubsystemRegistration>;
  loadForCanvas(
    canvas: Pick<CanvasData, 'nodes'>,
  ): Promise<readonly WebviewSubsystemRegistration[]>;
}

const BUILT_IN_SUBSYSTEM_LOADERS: Record<CanvasSubsystemId, WebviewSubsystemLoader> = {
  storyboard: () => import('./storyboard').then((module) => module.default),
  narrative: () => import('./narrative').then((module) => module.default),
  behavior: () => import('./behavior').then((module) => module.default),
  entity: () => import('./entity').then((module) => module.default),
  memory: () => import('./memory').then((module) => module.default),
};

export function createBuiltInWebviewSubsystemRegistry(
  loaders: Partial<Record<CanvasSubsystemId, WebviewSubsystemLoader>> = BUILT_IN_SUBSYSTEM_LOADERS,
): WebviewSubsystemRegistry {
  const registrations = new Map<CanvasSubsystemId, Promise<WebviewSubsystemRegistration>>();
  const manifests: readonly CanvasSubsystemManifest[] = BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS;

  return {
    manifests,
    getActiveSubsystems(canvas) {
      return summarizeCanvasSubsystems(canvas, manifests).activeSubsystems;
    },
    getNodeTypeSummary(canvas) {
      return summarizeCanvasSubsystems(canvas, manifests).nodeTypeSummary;
    },
    getManifest(id) {
      return manifests.find((manifest) => manifest.id === id);
    },
    getSubsystemForNodeType(type) {
      return manifests.find((manifest) => manifest.triggerNodeTypes.includes(type));
    },
    getCoreNodeRenderers() {
      return createCoreNodeRendererRegistry();
    },
    getCoreNodeTypeDescriptors() {
      return createCoreNodeTypeDescriptors();
    },
    load(id) {
      const existing = registrations.get(id);
      if (existing) {
        return existing;
      }

      const loader = loaders[id];
      if (!loader) {
        return Promise.reject(new Error(`No Canvas subsystem loader registered for "${id}"`));
      }

      const registration = loader();
      registrations.set(id, registration);
      return registration;
    },
    loadForCanvas(canvas) {
      return Promise.all(this.getActiveSubsystems(canvas).map((id) => this.load(id)));
    },
  };
}
