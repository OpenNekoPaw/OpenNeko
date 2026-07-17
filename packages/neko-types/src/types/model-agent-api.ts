import type {
  EngineBounds3,
  EngineQuat,
  EngineSceneSnapshot,
  EngineVec3,
} from '../generated/scene.engine';

// =============================================================================
// Neko Model Agent API Contracts
// =============================================================================

export type ModelSceneNodeKind = 'mesh' | 'light' | 'camera' | 'bone' | 'empty' | 'unknown';

export interface ModelSceneNodeInfo {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly visible: boolean;
  readonly kind: ModelSceneNodeKind;
  readonly position?: EngineVec3;
  readonly rotation?: EngineQuat;
  readonly scale?: EngineVec3;
  readonly materialIds?: readonly string[];
  readonly bounds?: EngineBounds3;
  readonly worldBounds?: EngineBounds3;
}
export interface ModelSceneMaterialInfo {
  readonly id: string;
  readonly name: string;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly baseColor?: readonly [number, number, number, number];
}

export interface ModelSceneAnimationInfo {
  readonly name: string;
  readonly index: number;
  readonly duration?: number;
}

export interface ModelSceneGraphSnapshot {
  readonly sceneId?: string;
  readonly nodes: readonly ModelSceneNodeInfo[];
  readonly materials: readonly ModelSceneMaterialInfo[];
  readonly animations: readonly ModelSceneAnimationInfo[];
  readonly activeModelPath?: string;
  readonly engineSnapshot?: EngineSceneSnapshot;
}

export interface ModelNodeTransformPatch {
  readonly position?: EngineVec3;
  readonly rotation?: EngineQuat;
  readonly scale?: EngineVec3;
}

export interface ModelMaterialPatch {
  readonly materialId: string;
  readonly params: Record<string, unknown>;
}

export interface ModelViewportCameraUpdate {
  readonly viewportId?: string;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up?: readonly [number, number, number];
  readonly fovY?: number;
}

export interface ModelOperationResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly revision?: number;
}

export interface NekoModelAPI {
  /** Package-owned structural, render-preview, runtime, and export-readiness facade for .nkm projects. */
  readonly projectQuality: import('../project-authoring/project-quality').ProjectQualityFacade;

  getSceneGraph(): Promise<ModelSceneGraphSnapshot | undefined>;
  getNodeProperties(nodeId: string): Promise<ModelSceneNodeInfo | undefined>;
  setNodeTransform(
    nodeId: string,
    transform: ModelNodeTransformPatch,
  ): Promise<ModelOperationResult>;
  setNodeVisible(nodeId: string, visible: boolean): Promise<ModelOperationResult>;
  updateMaterial(patch: ModelMaterialPatch): Promise<ModelOperationResult>;
  listAnimations(): Promise<readonly ModelSceneAnimationInfo[]>;
  playAnimation(nameOrIndex: string | number): Promise<ModelOperationResult>;
  stopAnimation(): Promise<ModelOperationResult>;
  seekAnimation(timeSeconds: number): Promise<ModelOperationResult>;
  updateViewportCamera?(update: ModelViewportCameraUpdate): Promise<ModelOperationResult>;
  getActiveModelPath(): string | undefined;
}
