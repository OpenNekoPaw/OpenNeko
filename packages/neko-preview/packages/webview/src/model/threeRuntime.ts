import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type {
  ModelPreviewCameraPreset,
  ModelPreviewCaptureSettings,
  ModelPreviewLightEntry,
  ModelPreviewSourceDescriptor,
  ModelPreviewStagingState,
  ModelPreviewTransform,
  ModelPreviewVector3,
  NormalizedModelFacts,
  ThreeReferencePanoramaOrientation,
  ThreeReferencePanelSubject,
  ThreeReferencePanoramaRuntimeDescriptor,
  ThreeReferencePoseControlMode,
  ThreeReferencePoseState,
  ThreeReferencePurpose,
  ThreeReferenceRuntimePoseCapabilities,
} from '@neko/shared';
import {
  applyDeclaredMannequinPose,
  createBlockoutReferencePreset,
  createMannequinSkeletonOverlay,
  createNeutralMannequin,
  type BlockoutReferenceImplementationId,
  type NeutralMannequinRuntime,
} from './threeReferencePresetRuntime';

export interface ModelPreviewNode {
  readonly path: string;
  readonly label: string;
  readonly mesh: boolean;
  readonly transform: ModelPreviewTransform;
}

export type ModelViewAxis = 'x' | 'y' | 'z';

export interface ModelViewAxisProjection {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

export type ModelViewOrientation = Readonly<Record<ModelViewAxis, ModelViewAxisProjection>>;

export interface ModelViewState {
  readonly orientation: ModelViewOrientation;
  readonly distance: number;
  readonly target: { readonly x: number; readonly y: number; readonly z: number };
}

export interface ThreeModelRuntimeCallbacks {
  readonly onTransformChanged?: (nodePath: string, transform: ModelPreviewTransform) => void;
  readonly onLightPositionChanged?: (
    lightId: ModelPreviewLightEntry['id'],
    position: ModelPreviewVector3,
  ) => void;
  readonly onViewChanged?: (view: ModelViewState) => void;
  readonly onDiagnostic?: (message: string) => void;
  readonly onRendererLost?: () => void;
}

export interface ThreeModelRuntimePort {
  load(source: ModelPreviewSourceDescriptor): Promise<NormalizedModelFacts>;
  loadPreset(
    preset: Extract<ThreeReferencePanelSubject, { readonly kind: 'builtin-preset' }>,
  ): Promise<NormalizedModelFacts>;
  applyReferencePose(pose: ThreeReferencePoseState): void;
  setPanoramaEnvironment(environment: {
    readonly runtime: ThreeReferencePanoramaRuntimeDescriptor;
    readonly orientation: ThreeReferencePanoramaOrientation;
  }): Promise<void>;
  clearPanoramaEnvironment(): void;
  capturePurpose(
    purpose: ThreeReferencePurpose,
    settings: ModelPreviewCaptureSettings,
    options?: { readonly poseControlMode?: ThreeReferencePoseControlMode },
  ): string;
  applyStaging(staging: ModelPreviewStagingState): void;
  getNodes(): readonly ModelPreviewNode[];
  setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void;
  setTransformEnabled(enabled: boolean): void;
  setGroundGridVisible(visible: boolean): void;
  setCameraGuide(camera: ModelPreviewCameraPreset | undefined): void;
  setLightGuide(lightId: ModelPreviewLightEntry['id'] | undefined): void;
  frameCamera(camera: ModelPreviewCameraPreset): void;
  frameModel(): void;
  resize(width: number, height: number): void;
  capture(settings: ModelPreviewCaptureSettings): string;
  dispose(): void;
}

export interface ThreeModelRuntimeFactory {
  create(canvas: HTMLCanvasElement, callbacks?: ThreeModelRuntimeCallbacks): ThreeModelRuntimePort;
}

export const browserThreeRuntimeFactory: ThreeModelRuntimeFactory = {
  create(canvas, callbacks) {
    return new BrowserThreeModelRuntime(canvas, callbacks);
  },
};

export interface RenderScheduler {
  request(): void;
  dispose(): void;
}

export function createRenderScheduler(
  renderFrame: (time: number) => boolean,
  requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (frameId: number) => void = cancelAnimationFrame,
): RenderScheduler {
  let frameId: number | undefined;
  let disposed = false;
  const run = (time: number): void => {
    frameId = undefined;
    if (disposed) return;
    if (renderFrame(time)) request();
  };
  const request = (): void => {
    if (!disposed && frameId === undefined) frameId = requestFrame(run);
  };
  return {
    request,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameId !== undefined) cancelFrame(frameId);
      frameId = undefined;
    },
  };
}

export function withObjectsHidden<T>(objects: readonly THREE.Object3D[], operation: () => T): T {
  const visibility = objects.map((object) => ({ object, visible: object.visible }));
  for (const { object } of visibility) object.visible = false;
  try {
    return operation();
  } finally {
    for (const { object, visible } of visibility) object.visible = visible;
  }
}

export function configureModelRendererColorPipeline(
  renderer: Pick<THREE.WebGLRenderer, 'outputColorSpace' | 'toneMapping' | 'toneMappingExposure'>,
): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
}

export function createGeometryMaterial(geometry: THREE.BufferGeometry): THREE.MeshStandardMaterial {
  const vertexColors = geometry.hasAttribute('color');
  return new THREE.MeshStandardMaterial({
    color: vertexColors ? 0xffffff : 0xb7bdc8,
    vertexColors,
  });
}

export function getOrbitDistanceBounds(radius: number): {
  readonly minDistance: number;
  readonly maxDistance: number;
} {
  return {
    // Keep the camera outside the model's bounding sphere. Allowing the orbit
    // camera inside exposes back faces and intersects nested clothing meshes,
    // which presents as missing content or geometry clipping at close range.
    minDistance: Math.max(radius * 1.05, 0.001),
    maxDistance: Math.max(radius * 20, 10),
  };
}

export function shouldApplyModelCameraPose(
  previousActiveCameraId: string | undefined,
  nextActiveCameraId: string,
): boolean {
  return previousActiveCameraId !== nextActiveCameraId;
}

export interface ModelGroundGridLayout {
  readonly size: number;
  readonly divisions: number;
  readonly y: number;
}

export function getModelGroundGridLayout(bounds: THREE.Box3): ModelGroundGridLayout {
  const size = bounds.getSize(new THREE.Vector3());
  const horizontalSpan = Math.max(size.x, size.z, 0.001);
  return {
    size: Math.max(horizontalSpan * 2.5, size.y * 1.5, 1),
    divisions: 24,
    y: bounds.min.y - Math.max(size.y * 0.002, 0.001),
  };
}

export function getModelCameraGuidePose(
  bounds: THREE.Box3,
  camera: ModelPreviewCameraPreset,
): { readonly position: THREE.Vector3; readonly target: THREE.Vector3; readonly radius: number } {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.001);
  return {
    position: center.clone().addScaledVector(toThreeVector(camera.position), radius),
    target: center.clone().add(toThreeVector(camera.target)),
    radius,
  };
}

export function getModelLightGuidePose(
  bounds: THREE.Box3,
  light: ModelPreviewLightEntry,
): { readonly position: THREE.Vector3; readonly target: THREE.Vector3; readonly radius: number } {
  const target = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.001);
  return {
    position: target.clone().addScaledVector(toThreeVector(light.position), radius),
    target,
    radius,
  };
}

export function getNormalizedModelLightPosition(
  bounds: THREE.Box3,
  position: THREE.Vector3,
): ModelPreviewVector3 {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.001);
  return fromThreeVector(position.clone().sub(center).divideScalar(radius));
}

export function projectModelViewOrientation(
  cameraQuaternion: THREE.Quaternion,
): ModelViewOrientation {
  const inverseCamera = cameraQuaternion.clone().invert();
  const project = (axis: THREE.Vector3): ModelViewAxisProjection => {
    const viewAxis = axis.applyQuaternion(inverseCamera);
    return { x: viewAxis.x, y: -viewAxis.y, depth: viewAxis.z };
  };
  return {
    x: project(new THREE.Vector3(1, 0, 0)),
    y: project(new THREE.Vector3(0, 1, 0)),
    z: project(new THREE.Vector3(0, 0, 1)),
  };
}

export const DEFAULT_MODEL_VIEW_STATE: ModelViewState = {
  orientation: {
    x: { x: 1, y: 0, depth: 0 },
    y: { x: 0, y: -1, depth: 0 },
    z: { x: 0, y: 0, depth: 1 },
  },
  distance: 3.5,
  target: { x: 0, y: 0, z: 0 },
};

export type TextureTransparencyInspector = (texture: THREE.Texture) => Promise<boolean>;

export async function promoteOpaqueBlendMaterials(
  root: THREE.Object3D,
  hasTransparentPixels: TextureTransparencyInspector = createTextureTransparencyInspector(),
): Promise<void> {
  const materials = collectMaterials(root);
  await Promise.all(
    [...materials].map(async (material) => {
      if (
        !material.transparent ||
        material.opacity < 1 ||
        material.vertexColors ||
        getMaterialTexture(material, 'alphaMap')
      ) {
        return;
      }
      const map = getMaterialColorMap(material);
      if (map && (await hasTransparentPixels(map))) return;
      material.transparent = false;
      material.depthWrite = true;
      material.needsUpdate = true;
    }),
  );
}

export function getModelPixelRatio(devicePixelRatio: number, interacting: boolean): number {
  return Math.min(Math.max(devicePixelRatio, 0.5), interacting ? 1 : 1.5);
}

export function assertPurposeCaptureAllowed(input: {
  readonly purpose: ThreeReferencePurpose;
  readonly loadedReferenceKind: 'source-model' | 'guide-only' | undefined;
  readonly hasPoseRuntime: boolean;
  readonly hasPanorama: boolean;
}): void {
  switch (input.purpose) {
    case 'appearance':
      if (input.loadedReferenceKind !== 'source-model') {
        throw new Error('Guide-only 3D Reference presets cannot produce appearance output.');
      }
      return;
    case 'pose':
      if (!input.hasPoseRuntime) {
        throw new Error('Pose output requires an articulated 3D Reference subject.');
      }
      return;
    case 'camera':
      if (!input.loadedReferenceKind && !input.hasPanorama) {
        throw new Error('Camera output requires a staged 3D Reference subject or panorama.');
      }
      return;
    case 'panorama-scene':
      if (!input.hasPanorama) {
        throw new Error('Panoramic-scene output requires a staged panorama.');
      }
      return;
  }
}

const MODEL_PREVIEW_LIGHT_IDS = [
  'key',
  'fill',
  'rim',
] as const satisfies readonly ModelPreviewLightEntry['id'][];

const MODEL_PREVIEW_LIGHT_GUIDE_COLORS: Readonly<Record<ModelPreviewLightEntry['id'], number>> = {
  key: 0xf59e0b,
  fill: 0x3b82f6,
  rim: 0xa855f7,
};

class BrowserThreeModelRuntime implements ThreeModelRuntimePort {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly orbit: OrbitControls;
  private readonly transform: TransformControls;
  private readonly transformHelper: THREE.Object3D;
  private readonly renderScheduler: RenderScheduler;
  private readonly environmentLight = new THREE.HemisphereLight(0xffffff, 0x202020, 0.7);
  private readonly directionalLights = new Map<
    ModelPreviewLightEntry['id'],
    THREE.DirectionalLight
  >();
  private readonly lightGuides = new Map<
    ModelPreviewLightEntry['id'],
    { readonly marker: THREE.Mesh; readonly arrow: THREE.ArrowHelper }
  >();
  private readonly lightGuideIds = new WeakMap<THREE.Object3D, ModelPreviewLightEntry['id']>();
  private readonly callbacks: ThreeModelRuntimeCallbacks;
  private readonly nodes = new Map<string, THREE.Object3D>();
  private readonly paths = new WeakMap<THREE.Object3D, string>();
  private modelRoot: THREE.Object3D | undefined;
  private modelBounds: THREE.Box3 | undefined;
  private groundGrid: THREE.GridHelper | undefined;
  private cameraGuide: THREE.CameraHelper | undefined;
  private groundGridVisible = true;
  private activeCameraPreset: ModelPreviewCameraPreset | undefined;
  private appliedCameraId: string | undefined;
  private selectedNodePath: string | undefined;
  private selectedLightId: ModelPreviewLightEntry['id'] | undefined;
  private appliedLights: readonly ModelPreviewLightEntry[] = [];
  private transformEnabled = false;
  private facts: NormalizedModelFacts | undefined;
  private mannequin: NeutralMannequinRuntime | undefined;
  private panoramaTexture: THREE.Texture | undefined;
  private loadedReferenceKind: 'source-model' | 'guide-only' | undefined;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private interactionDepth = 0;
  private loadEpoch = 0;
  private panoramaEpoch = 0;
  private disposed = false;
  private readonly requestRender = (): void => this.renderScheduler.request();
  private readonly handleTransformChange = (): void => {
    const object = this.transform.object;
    const lightId = object ? this.lightGuideIds.get(object) : undefined;
    if (lightId) {
      const light = this.directionalLights.get(lightId);
      if (!light) throw new Error(`Model Preview light is missing: ${lightId}`);
      light.position.copy(object.position);
      this.syncLightGuideDirection(lightId);
    }
    this.requestRender();
  };
  private readonly commitTransformChange = (): void => this.emitTransformChange();
  private readonly handleTransformDraggingChanged = (event: { readonly value: unknown }): void => {
    const dragging = event.value === true;
    this.orbit.enabled = !dragging;
    if (dragging) this.beginInteraction();
    else this.endInteraction();
  };
  private readonly handleOrbitChange = (): void => {
    this.requestRender();
    this.emitViewState();
  };
  private readonly beginOrbitInteraction = (): void => this.beginInteraction();
  private readonly endOrbitInteraction = (): void => this.endInteraction();
  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.callbacks.onRendererLost?.();
  };

  constructor(canvas: HTMLCanvasElement, callbacks: ThreeModelRuntimeCallbacks = {}) {
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    configureModelRendererColorPipeline(this.renderer);
    this.renderer.setPixelRatio(getModelPixelRatio(window.devicePixelRatio || 1, false));
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.transform = new TransformControls(this.camera, canvas);
    this.transformHelper = this.transform.getHelper();
    this.renderScheduler = createRenderScheduler(() => {
      const orbitChanged = this.orbit.update();
      this.renderer.render(this.scene, this.camera);
      return orbitChanged;
    });
    this.transform.addEventListener('dragging-changed', this.handleTransformDraggingChanged);
    this.transform.addEventListener('change', this.handleTransformChange);
    this.transform.addEventListener('mouseUp', this.commitTransformChange);
    this.orbit.addEventListener('change', this.handleOrbitChange);
    this.orbit.addEventListener('start', this.beginOrbitInteraction);
    this.orbit.addEventListener('end', this.endOrbitInteraction);
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.scene.add(this.environmentLight, this.transformHelper);
    for (const id of MODEL_PREVIEW_LIGHT_IDS) {
      const light = new THREE.DirectionalLight(0xffffff, 1);
      this.directionalLights.set(id, light);
      this.scene.add(light);
    }
    this.camera.position.set(0, 0.15, 3.5);
    this.orbit.update();
    this.emitViewState();
    this.requestRender();
  }

  async load(source: ModelPreviewSourceDescriptor): Promise<NormalizedModelFacts> {
    this.assertLive();
    const epoch = ++this.loadEpoch;
    this.detachModel();
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(createExactUrlModifier(source));
    manager.onError = (url) =>
      this.callbacks.onDiagnostic?.(`Failed to load authorized URL: ${url}`);
    const loaded = await loadModelSource(source, manager);
    if (this.disposed || epoch !== this.loadEpoch) {
      disposeObjectTree(loaded.root);
      throw new Error('Model Preview load completed after its session was replaced.');
    }
    const bounds = new THREE.Box3().setFromObject(loaded.root);
    if (bounds.isEmpty()) {
      disposeObjectTree(loaded.root);
      throw new Error('Model source contains no renderable bounds.');
    }
    this.modelRoot = loaded.root;
    this.loadedReferenceKind = 'source-model';
    this.scene.add(loaded.root);
    this.indexNodes(loaded.root);
    this.facts = collectNormalizedFacts(loaded.root, bounds, loaded.animationCount);
    this.frameBounds(bounds);
    return this.facts;
  }

  async loadPreset(
    preset: Extract<ThreeReferencePanelSubject, { readonly kind: 'builtin-preset' }>,
  ): Promise<NormalizedModelFacts> {
    this.assertLive();
    const epoch = ++this.loadEpoch;
    this.detachModel();
    if (preset.runtime.kind !== 'procedural') {
      throw new Error(`Unsupported 3D Reference preset runtime: ${preset.subject.presetId}`);
    }
    const mannequin =
      preset.runtime.implementationId === 'neutral-mannequin-v1'
        ? createNeutralMannequin(requireMannequinPoseCapabilities(preset.runtime.poseCapabilities))
        : undefined;
    const root = mannequin
      ? mannequin.root
      : createBlockoutReferencePreset(
          toBlockoutReferenceImplementationId(preset.runtime.implementationId),
        );
    if (this.disposed || epoch !== this.loadEpoch) {
      disposeObjectTree(root);
      throw new Error('3D Reference preset load completed after its session was replaced.');
    }
    const bounds = new THREE.Box3().setFromObject(root);
    if (bounds.isEmpty()) {
      disposeObjectTree(root);
      throw new Error('3D Reference preset contains no renderable bounds.');
    }
    this.mannequin = mannequin;
    this.modelRoot = root;
    this.loadedReferenceKind = 'guide-only';
    this.scene.add(root);
    this.indexNodes(root);
    this.facts = collectNormalizedFacts(root, bounds, 0);
    this.frameBounds(bounds);
    return this.facts;
  }

  applyReferencePose(pose: ThreeReferencePoseState): void {
    this.assertLive();
    if (!this.mannequin) {
      throw new Error('3D Reference pose operations require an articulated guide preset.');
    }
    applyDeclaredMannequinPose(this.mannequin, pose);
    const bounds = new THREE.Box3().setFromObject(this.mannequin.root);
    if (bounds.isEmpty()) throw new Error('3D Reference pose produced empty renderable bounds.');
    this.modelBounds = bounds;
    this.replaceGroundGrid(bounds);
    this.replaceLightGuides(bounds);
    if (this.appliedLights.length > 0) this.applyLightRig(this.appliedLights);
    this.requestRender();
  }

  async setPanoramaEnvironment(environment: {
    readonly runtime: ThreeReferencePanoramaRuntimeDescriptor;
    readonly orientation: ThreeReferencePanoramaOrientation;
  }): Promise<void> {
    this.assertLive();
    const epoch = ++this.panoramaEpoch;
    const texture = await loadPanoramaTexture(environment.runtime);
    if (this.disposed || epoch !== this.panoramaEpoch) {
      texture.dispose();
      throw new Error('3D Reference panorama load completed after its session was replaced.');
    }
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    this.detachPanoramaEnvironment();
    this.panoramaTexture = texture;
    this.scene.background = texture;
    this.scene.environment = texture;
    this.scene.backgroundRotation.set(
      THREE.MathUtils.degToRad(environment.orientation.pitchDeg),
      THREE.MathUtils.degToRad(environment.orientation.yawDeg),
      0,
    );
    this.scene.environmentRotation.copy(this.scene.backgroundRotation);
    this.camera.fov = environment.orientation.fieldOfViewDeg;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  clearPanoramaEnvironment(): void {
    this.assertLive();
    this.panoramaEpoch += 1;
    this.detachPanoramaEnvironment();
    this.requestRender();
  }

  capturePurpose(
    purpose: ThreeReferencePurpose,
    settings: ModelPreviewCaptureSettings,
    options: { readonly poseControlMode?: ThreeReferencePoseControlMode } = {},
  ): string {
    this.assertLive();
    assertPurposeCaptureAllowed({
      purpose,
      loadedReferenceKind: this.loadedReferenceKind,
      hasPoseRuntime: this.mannequin !== undefined,
      hasPanorama: this.panoramaTexture !== undefined,
    });
    const restore = this.preparePurposeRenderPass(purpose, options.poseControlMode);
    try {
      return this.capture(settings);
    } finally {
      restore();
    }
  }

  applyStaging(staging: ModelPreviewStagingState): void {
    this.assertLive();
    const facts = this.facts;
    if (!facts) return;
    this.renderer.setClearColor(staging.background, 1);
    for (const patch of staging.transformPatches) {
      const object = this.nodes.get(patch.nodePath);
      if (object) applyTransform(object, patch.transform);
    }
    this.selectedNodePath = staging.selectedNodePath;
    this.syncTransformAttachment();
    const camera = staging.cameraPresets.find(
      (candidate) => candidate.id === staging.activeCameraId,
    );
    if (!camera)
      throw new Error(`Active Model Preview camera is missing: ${staging.activeCameraId}`);
    const radius = Math.max(facts.bounds.radius, 0.001);
    const center = toThreeVector(facts.bounds.center);
    const applyCameraPose = shouldApplyModelCameraPose(this.appliedCameraId, camera.id);
    this.activeCameraPreset = camera;
    this.camera.fov = camera.fieldOfViewDeg;
    this.camera.updateProjectionMatrix();
    if (applyCameraPose) this.applyCameraPose(camera, center, radius);
    this.appliedCameraId = camera.id;
    this.environmentLight.intensity = staging.lightRig.environmentIntensity;
    this.appliedLights = staging.lightRig.lights;
    this.applyLightRig(staging.lightRig.lights);
    this.requestRender();
  }

  getNodes(): readonly ModelPreviewNode[] {
    return [...this.nodes.entries()].map(([nodePath, object]) => ({
      path: nodePath,
      label: object.name || nodePath.split('/').at(-1) || nodePath,
      mesh: object instanceof THREE.Mesh || object instanceof THREE.Points,
      transform: serializeTransform(object),
    }));
  }

  setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
    this.assertLive();
    if (this.selectedLightId && mode !== 'translate') {
      throw new Error('Model Preview directional-light helpers only support translation.');
    }
    this.transform.setMode(mode);
  }

  setTransformEnabled(enabled: boolean): void {
    this.assertLive();
    this.transformEnabled = enabled;
    this.syncTransformAttachment();
    this.requestRender();
  }

  setGroundGridVisible(visible: boolean): void {
    this.assertLive();
    this.groundGridVisible = visible;
    if (this.groundGrid) this.groundGrid.visible = visible;
    this.requestRender();
  }

  setCameraGuide(camera: ModelPreviewCameraPreset | undefined): void {
    this.assertLive();
    this.detachCameraGuide();
    if (!camera || !this.modelBounds) {
      this.requestRender();
      return;
    }
    const pose = getModelCameraGuidePose(this.modelBounds, camera);
    const targetDistance = pose.position.distanceTo(pose.target);
    const helperCamera = new THREE.PerspectiveCamera(
      camera.fieldOfViewDeg,
      this.camera.aspect,
      Math.max(pose.radius / 20, 0.001),
      Math.max(targetDistance * 1.25, pose.radius * 1.5, 1),
    );
    helperCamera.position.copy(pose.position);
    helperCamera.lookAt(pose.target);
    helperCamera.updateMatrixWorld(true);
    const helper = new THREE.CameraHelper(helperCamera);
    helper.name = `Model Preview camera guide: ${camera.id}`;
    helper.renderOrder = 2;
    this.cameraGuide = helper;
    this.scene.add(helper);
    this.requestRender();
  }

  setLightGuide(lightId: ModelPreviewLightEntry['id'] | undefined): void {
    this.assertLive();
    if (lightId && !this.directionalLights.has(lightId)) {
      throw new Error(`Unknown Model Preview light: ${lightId}`);
    }
    this.selectedLightId = lightId;
    if (lightId) this.transform.setMode('translate');
    for (const [candidateId, guide] of this.lightGuides) {
      const visible = candidateId === lightId;
      guide.marker.visible = visible;
      guide.arrow.visible = visible;
    }
    this.syncTransformAttachment();
    this.requestRender();
  }

  frameCamera(camera: ModelPreviewCameraPreset): void {
    this.assertLive();
    if (!this.modelBounds) throw new Error('Model Preview renderer has no loaded model bounds.');
    const pose = getModelCameraGuidePose(this.modelBounds, camera);
    this.camera.fov = camera.fieldOfViewDeg;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(pose.position);
    this.orbit.target.copy(pose.target);
    this.orbit.update();
    this.activeCameraPreset = camera;
    this.appliedCameraId = camera.id;
    this.emitViewState();
    this.requestRender();
  }

  frameModel(): void {
    this.assertLive();
    if (!this.modelBounds) throw new Error('Model Preview renderer has no loaded model bounds.');
    this.frameBounds(this.modelBounds, this.activeCameraPreset);
  }

  resize(width: number, height: number): void {
    this.assertLive();
    if (width <= 0 || height <= 0) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      getModelPixelRatio(window.devicePixelRatio || 1, this.interactionDepth > 0),
    );
    this.renderer.setSize(width, height, false);
    this.requestRender();
  }

  capture(settings: ModelPreviewCaptureSettings): string {
    this.assertLive();
    if (
      settings.width < 64 ||
      settings.height < 64 ||
      settings.width > 2048 ||
      settings.height > 2048
    ) {
      throw new Error('Model Preview capture dimensions must be between 64 and 2048 pixels.');
    }
    if (!this.modelRoot && !this.panoramaTexture) {
      throw new Error('3D Reference renderer has no loaded subject or panorama.');
    }
    const previousSize = new THREE.Vector2();
    this.renderer.getSize(previousSize);
    const previousPixelRatio = this.renderer.getPixelRatio();
    const previousAspect = this.camera.aspect;
    const gridWasVisible = this.groundGrid?.visible ?? false;
    const cameraGuideWasVisible = this.cameraGuide?.visible ?? false;
    const editorHelpers = [
      this.transformHelper,
      ...[...this.lightGuides.values()].flatMap((guide) => [guide.marker, guide.arrow]),
    ];
    if (this.groundGrid) this.groundGrid.visible = false;
    if (this.cameraGuide) this.cameraGuide.visible = false;
    try {
      return withObjectsHidden(editorHelpers, () => {
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(settings.width, settings.height, false);
        this.camera.aspect = settings.width / settings.height;
        this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
        const dataUrl = this.renderer.domElement.toDataURL('image/png');
        if (!dataUrl.startsWith('data:image/png;base64,')) {
          throw new Error('Model Preview canvas did not produce a PNG capture.');
        }
        return dataUrl;
      });
    } finally {
      if (this.groundGrid) this.groundGrid.visible = gridWasVisible;
      if (this.cameraGuide) this.cameraGuide.visible = cameraGuideWasVisible;
      this.renderer.setPixelRatio(previousPixelRatio);
      this.renderer.setSize(previousSize.x, previousSize.y, false);
      this.camera.aspect = previousAspect;
      this.camera.updateProjectionMatrix();
      this.requestRender();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadEpoch += 1;
    this.renderScheduler.dispose();
    this.transform.removeEventListener('dragging-changed', this.handleTransformDraggingChanged);
    this.transform.removeEventListener('change', this.handleTransformChange);
    this.transform.removeEventListener('mouseUp', this.commitTransformChange);
    this.orbit.removeEventListener('change', this.handleOrbitChange);
    this.orbit.removeEventListener('start', this.beginOrbitInteraction);
    this.orbit.removeEventListener('end', this.endOrbitInteraction);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.transform.detach();
    this.transform.dispose();
    this.scene.remove(this.transformHelper);
    this.orbit.dispose();
    this.detachModel();
    this.panoramaEpoch += 1;
    this.detachPanoramaEnvironment();
    for (const light of this.directionalLights.values()) {
      this.scene.remove(light, light.target);
    }
    this.scene.remove(this.environmentLight);
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private frameBounds(bounds: THREE.Box3, cameraPreset?: ModelPreviewCameraPreset): void {
    this.modelBounds = bounds.clone();
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.001);
    this.camera.near = Math.max(radius / 1000, 0.001);
    this.camera.far = Math.max(radius * 100, 100);
    if (cameraPreset) this.camera.fov = cameraPreset.fieldOfViewDeg;
    this.camera.updateProjectionMatrix();
    const distanceBounds = getOrbitDistanceBounds(radius);
    this.orbit.minDistance = distanceBounds.minDistance;
    this.orbit.maxDistance = distanceBounds.maxDistance;
    this.applyCameraPose(
      cameraPreset ?? {
        id: 'camera-front',
        label: 'Front',
        position: { x: 0, y: 0.15, z: 3.5 },
        target: { x: 0, y: 0, z: 0 },
        fieldOfViewDeg: this.camera.fov,
      },
      center,
      radius,
    );
    this.replaceGroundGrid(bounds);
    this.replaceLightGuides(bounds);
    this.requestRender();
  }

  private applyCameraPose(
    cameraPreset: ModelPreviewCameraPreset,
    center: THREE.Vector3,
    radius: number,
  ): void {
    this.camera.position.copy(center).addScaledVector(toThreeVector(cameraPreset.position), radius);
    this.orbit.target.copy(center).add(toThreeVector(cameraPreset.target));
    this.orbit.update();
    this.emitViewState();
  }

  private replaceGroundGrid(bounds: THREE.Box3): void {
    this.detachGroundGrid();
    const layout = getModelGroundGridLayout(bounds);
    const grid = new THREE.GridHelper(layout.size, layout.divisions, 0xb9c2cf, 0xdde2e8);
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = 0.62;
      material.depthWrite = false;
    }
    grid.position.y = layout.y;
    grid.visible = this.groundGridVisible;
    grid.renderOrder = -1;
    this.groundGrid = grid;
    this.scene.add(grid);
  }

  private replaceLightGuides(bounds: THREE.Box3): void {
    this.detachLightGuides();
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.001);
    for (const lightId of MODEL_PREVIEW_LIGHT_IDS) {
      const color = MODEL_PREVIEW_LIGHT_GUIDE_COLORS[lightId];
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(radius * 0.055, 0.006), 18, 12),
        new THREE.MeshBasicMaterial({
          color,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      marker.name = `Model Preview light guide: ${lightId}`;
      marker.renderOrder = 4;
      marker.visible = lightId === this.selectedLightId;
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, -1, 0),
        bounds.getCenter(new THREE.Vector3()),
        radius,
        color,
        radius * 0.18,
        radius * 0.1,
      );
      arrow.name = `Model Preview light direction: ${lightId}`;
      arrow.renderOrder = 3;
      arrow.visible = lightId === this.selectedLightId;
      arrow.traverse((object) => {
        if (!(object instanceof THREE.Line || object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          material.depthTest = false;
          material.depthWrite = false;
          material.toneMapped = false;
        }
        object.renderOrder = 3;
      });
      this.lightGuides.set(lightId, { marker, arrow });
      this.lightGuideIds.set(marker, lightId);
      this.scene.add(arrow, marker);
    }
    this.syncTransformAttachment();
  }

  private applyLightRig(lights: readonly ModelPreviewLightEntry[]): void {
    if (!this.modelBounds) throw new Error('Model Preview renderer has no loaded model bounds.');
    for (const entry of lights) {
      const light = this.directionalLights.get(entry.id);
      if (!light) throw new Error(`Model Preview light is missing: ${entry.id}`);
      const guide = this.lightGuides.get(entry.id);
      if (!guide) throw new Error(`Model Preview light guide is missing: ${entry.id}`);
      const pose = getModelLightGuidePose(this.modelBounds, entry);
      light.color.set(entry.color);
      light.intensity = entry.intensity;
      light.position.copy(pose.position);
      light.target.position.copy(pose.target);
      if (!light.target.parent) this.scene.add(light.target);
      guide.marker.position.copy(pose.position);
      this.syncLightGuideDirection(entry.id);
    }
  }

  private syncLightGuideDirection(lightId: ModelPreviewLightEntry['id']): void {
    const bounds = this.modelBounds;
    const guide = this.lightGuides.get(lightId);
    if (!bounds || !guide) return;
    const target = bounds.getCenter(new THREE.Vector3());
    const direction = target.clone().sub(guide.marker.position);
    const distance = direction.length();
    const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.001);
    if (distance === 0) direction.set(0, -1, 0);
    else direction.divideScalar(distance);
    guide.arrow.position.copy(guide.marker.position);
    guide.arrow.setDirection(direction);
    guide.arrow.setLength(Math.max(distance, radius * 0.05), radius * 0.18, radius * 0.1);
  }

  private syncTransformAttachment(): void {
    if (!this.transformEnabled) {
      this.transform.detach();
      return;
    }
    if (this.selectedLightId) {
      const guide = this.lightGuides.get(this.selectedLightId);
      if (guide) this.transform.attach(guide.marker);
      else this.transform.detach();
      return;
    }
    const selected = this.selectedNodePath ? this.nodes.get(this.selectedNodePath) : undefined;
    if (selected) this.transform.attach(selected);
    else this.transform.detach();
  }

  private detachGroundGrid(): void {
    if (!this.groundGrid) return;
    this.scene.remove(this.groundGrid);
    disposeObjectTree(this.groundGrid);
    this.groundGrid = undefined;
  }

  private detachLightGuides(): void {
    const transformTarget = this.transform.object;
    if (transformTarget && this.lightGuideIds.has(transformTarget)) this.transform.detach();
    for (const guide of this.lightGuides.values()) {
      this.scene.remove(guide.marker, guide.arrow);
      disposeObjectTree(guide.marker);
      disposeObjectTree(guide.arrow);
    }
    this.lightGuides.clear();
  }

  private detachCameraGuide(): void {
    if (!this.cameraGuide) return;
    this.scene.remove(this.cameraGuide);
    disposeObjectTree(this.cameraGuide);
    this.cameraGuide = undefined;
  }

  private emitViewState(): void {
    this.callbacks.onViewChanged?.({
      orientation: projectModelViewOrientation(this.camera.quaternion),
      distance: this.camera.position.distanceTo(this.orbit.target),
      target: fromThreeVector(this.orbit.target),
    });
  }

  private beginInteraction(): void {
    this.interactionDepth += 1;
    if (this.interactionDepth === 1) this.applyInteractionResolution();
  }

  private endInteraction(): void {
    if (this.interactionDepth === 0) return;
    this.interactionDepth -= 1;
    if (this.interactionDepth === 0) this.applyInteractionResolution();
  }

  private applyInteractionResolution(): void {
    this.renderer.setPixelRatio(
      getModelPixelRatio(window.devicePixelRatio || 1, this.interactionDepth > 0),
    );
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false);
    this.requestRender();
  }

  private indexNodes(root: THREE.Object3D): void {
    this.nodes.clear();
    const visit = (object: THREE.Object3D, nodePath: string) => {
      this.nodes.set(nodePath, object);
      this.paths.set(object, nodePath);
      object.children.forEach((child, index) => {
        const label = sanitizePathSegment(child.name || child.type);
        visit(child, `${nodePath}/${index}:${label}`);
      });
    };
    visit(root, 'root');
  }

  private emitTransformChange(): void {
    const object = this.transform.object;
    if (!object) return;
    const lightId = this.lightGuideIds.get(object);
    if (lightId) {
      if (!this.modelBounds) throw new Error('Model Preview renderer has no loaded model bounds.');
      this.callbacks.onLightPositionChanged?.(
        lightId,
        getNormalizedModelLightPosition(this.modelBounds, object.position),
      );
      return;
    }
    const nodePath = this.paths.get(object);
    if (!nodePath) throw new Error('Model Preview transform target is not registered.');
    this.callbacks.onTransformChanged?.(nodePath, serializeTransform(object));
  }

  private detachModel(): void {
    this.transform.detach();
    this.detachGroundGrid();
    this.detachCameraGuide();
    this.detachLightGuides();
    if (this.modelRoot) {
      this.scene.remove(this.modelRoot);
      disposeObjectTree(this.modelRoot);
    }
    this.modelRoot = undefined;
    this.mannequin = undefined;
    this.loadedReferenceKind = undefined;
    this.modelBounds = undefined;
    this.selectedNodePath = undefined;
    this.selectedLightId = undefined;
    this.appliedLights = [];
    this.facts = undefined;
    this.activeCameraPreset = undefined;
    this.appliedCameraId = undefined;
    this.nodes.clear();
  }

  private detachPanoramaEnvironment(): void {
    if (!this.panoramaTexture) return;
    if (this.scene.background === this.panoramaTexture) this.scene.background = null;
    if (this.scene.environment === this.panoramaTexture) this.scene.environment = null;
    this.panoramaTexture.dispose();
    this.panoramaTexture = undefined;
  }

  private preparePurposeRenderPass(
    purpose: ThreeReferencePurpose,
    poseControlMode: ThreeReferencePoseControlMode | undefined,
  ): () => void {
    const transformWasVisible = this.transformHelper.visible;
    this.transformHelper.visible = false;
    if (purpose !== 'pose') {
      return () => {
        this.transformHelper.visible = transformWasVisible;
      };
    }
    if (!this.mannequin) {
      this.transformHelper.visible = transformWasVisible;
      throw new Error('Pose render pass requires an articulated 3D Reference subject.');
    }
    const mannequinRoot = this.mannequin.root;
    if (poseControlMode === 'depth') {
      const previousOverride = this.scene.overrideMaterial;
      const depthMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.BasicDepthPacking,
      });
      this.scene.overrideMaterial = depthMaterial;
      return () => {
        this.scene.overrideMaterial = previousOverride;
        depthMaterial.dispose();
        this.transformHelper.visible = transformWasVisible;
      };
    }
    const modelWasVisible = mannequinRoot.visible;
    const skeleton = createMannequinSkeletonOverlay(this.mannequin);
    mannequinRoot.visible = false;
    this.scene.add(skeleton);
    return () => {
      this.scene.remove(skeleton);
      disposeObjectTree(skeleton);
      mannequinRoot.visible = modelWasVisible;
      this.transformHelper.visible = transformWasVisible;
    };
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('Model Preview Three runtime is disposed.');
  }
}

function requireMannequinPoseCapabilities(
  capabilities: ThreeReferenceRuntimePoseCapabilities | undefined,
): ThreeReferenceRuntimePoseCapabilities {
  if (!capabilities) {
    throw new Error('Neutral mannequin preset is missing declared pose capabilities.');
  }
  return capabilities;
}

function toBlockoutReferenceImplementationId(
  implementationId: string,
): BlockoutReferenceImplementationId {
  switch (implementationId) {
    case 'primitive-blockout-props-v1':
    case 'studio-room-blockout-v1':
    case 'neutral-panorama-grid-v1':
      return implementationId;
    default:
      throw new Error(`Unknown procedural 3D Reference runtime: ${implementationId}`);
  }
}

async function loadModelSource(
  source: ModelPreviewSourceDescriptor,
  manager: THREE.LoadingManager,
): Promise<{ readonly root: THREE.Object3D; readonly animationCount: number }> {
  switch (source.format) {
    case 'glb':
    case 'gltf': {
      const gltf = await new GLTFLoader(manager).loadAsync(source.entryUri);
      await promoteOpaqueBlendMaterials(gltf.scene);
      return { root: gltf.scene, animationCount: gltf.animations.length };
    }
    case 'obj': {
      const objLoader = new OBJLoader(manager);
      const materialUris = Object.entries(source.uriMap)
        .filter(([reference]) => reference.toLowerCase().endsWith('.mtl'))
        .map(([, uri]) => uri);
      if (materialUris.length > 0) {
        const materials = await loadObjMaterials(materialUris, manager);
        objLoader.setMaterials(materials);
      }
      const root = await objLoader.loadAsync(source.entryUri);
      await promoteOpaqueBlendMaterials(root);
      return { root, animationCount: 0 };
    }
    case 'stl': {
      const geometry = await new STLLoader(manager).loadAsync(source.entryUri);
      geometry.computeVertexNormals();
      return {
        root: new THREE.Mesh(geometry, createGeometryMaterial(geometry)),
        animationCount: 0,
      };
    }
    case 'ply': {
      const geometry = await new PLYLoader(manager).loadAsync(source.entryUri);
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      return {
        root: new THREE.Mesh(geometry, createGeometryMaterial(geometry)),
        animationCount: 0,
      };
    }
  }
}

async function loadPanoramaTexture(
  runtime: ThreeReferencePanoramaRuntimeDescriptor,
): Promise<THREE.Texture> {
  switch (runtime.mediaType) {
    case 'image/vnd.radiance':
      return new RGBELoader().loadAsync(runtime.uri);
    case 'image/x-exr':
      return new EXRLoader().loadAsync(runtime.uri);
    case 'image/jpeg':
    case 'image/png':
    case 'image/webp':
      return new THREE.TextureLoader().loadAsync(runtime.uri);
  }
}

function createTextureTransparencyInspector(): TextureTransparencyInspector {
  const cache = new WeakMap<THREE.Source, Promise<boolean>>();
  return (texture) => {
    const cached = cache.get(texture.source);
    if (cached) return cached;
    const inspection = Promise.resolve(inspectTextureAlpha(texture));
    cache.set(texture.source, inspection);
    return inspection;
  };
}

function inspectTextureAlpha(texture: THREE.Texture): boolean {
  const image: unknown = texture.source.data;
  const drawable = getDrawableImage(image);
  if (!drawable) {
    throw new Error('Model Preview could not inspect a loaded base-color texture.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = drawable.width;
  canvas.height = drawable.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Model Preview could not create a texture inspection canvas.');
  context.drawImage(drawable.image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 255) return true;
  }
  return false;
}

interface DrawableImage {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

function getDrawableImage(image: unknown): DrawableImage | undefined {
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    return { image, width: image.width, height: image.height };
  }
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  }
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    return { image, width: image.width, height: image.height };
  }
  if (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas) {
    return { image, width: image.width, height: image.height };
  }
  return undefined;
}

function getMaterialColorMap(material: THREE.Material): THREE.Texture | undefined {
  return getMaterialTexture(material, 'map');
}

function getMaterialTexture(
  material: THREE.Material,
  property: 'alphaMap' | 'map',
): THREE.Texture | undefined {
  if (!(property in material)) return undefined;
  const texture: unknown = Reflect.get(material, property);
  return texture instanceof THREE.Texture ? texture : undefined;
}

function collectMaterials(root: THREE.Object3D): Set<THREE.Material> {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (Array.isArray(object.material))
      object.material.forEach((material) => materials.add(material));
    else materials.add(object.material);
  });
  return materials;
}

async function loadObjMaterials(
  uris: readonly string[],
  manager: THREE.LoadingManager,
): Promise<MTLLoader.MaterialCreator> {
  const loader = new MTLLoader(manager);
  const creators = await Promise.all(uris.map((uri) => loader.loadAsync(uri)));
  const primary = creators[0];
  if (!primary) throw new Error('OBJ source declared no loadable material library.');
  for (const creator of creators.slice(1)) {
    Object.assign(primary.materials, creator.materials);
  }
  primary.preload();
  return primary;
}

export function createExactUrlModifier(
  source: ModelPreviewSourceDescriptor,
): (url: string) => string {
  const exact = new Map<string, string>();
  const projected = new Set(Object.values(source.uriMap));
  for (const [reference, uri] of Object.entries(source.uriMap)) {
    exact.set(reference, uri);
    const alias = resolveRelativeUrl(source.entryUri, reference);
    if (alias) exact.set(alias, uri);
  }
  return (url) => {
    // GLTFLoader materializes GLB-embedded images as panel-local object URLs.
    // Source-declared dependencies have already been enumerated and validated by
    // the Extension, so blob: here is a browser-owned projection, not a fallback
    // path to an undeclared file or network resource.
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    if (projected.has(url)) return url;
    const direct = exact.get(url);
    if (direct) return direct;
    const suffixMatches = Object.entries(source.uriMap).filter(([reference]) =>
      normalizeUrlPath(url).endsWith(`/${normalizeUrlPath(reference)}`),
    );
    if (suffixMatches.length === 1) return suffixMatches[0]?.[1] ?? url;
    throw new Error(`Model Preview rejected unresolved URL: ${url}`);
  };
}

function resolveRelativeUrl(base: string, reference: string): string | undefined {
  try {
    return new URL(reference, base).toString();
  } catch {
    const slash = base.lastIndexOf('/');
    return slash >= 0 ? `${base.slice(0, slash + 1)}${reference}` : undefined;
  }
}

function normalizeUrlPath(value: string): string {
  try {
    return decodeURIComponent(value).replaceAll('\\', '/');
  } catch {
    return value.replaceAll('\\', '/');
  }
}

export function collectNormalizedFacts(
  root: THREE.Object3D,
  bounds: THREE.Box3,
  animationCount: number,
): NormalizedModelFacts {
  let nodeCount = 0;
  let meshCount = 0;
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    nodeCount += 1;
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      meshCount += 1;
      const material = object.material;
      if (Array.isArray(material)) material.forEach((item) => materials.add(item));
      else materials.add(material);
    }
  });
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  return {
    bounds: {
      min: fromThreeVector(bounds.min),
      max: fromThreeVector(bounds.max),
      center: fromThreeVector(center),
      size: fromThreeVector(size),
      radius: size.length() / 2,
    },
    nodeCount,
    meshCount,
    materialCount: materials.size,
    animationCount,
  };
}

function serializeTransform(object: THREE.Object3D): ModelPreviewTransform {
  return {
    position: fromThreeVector(object.position),
    rotation: {
      x: object.rotation.x,
      y: object.rotation.y,
      z: object.rotation.z,
      order: 'XYZ',
    },
    scale: fromThreeVector(object.scale),
  };
}

function applyTransform(object: THREE.Object3D, transform: ModelPreviewTransform): void {
  object.position.copy(toThreeVector(transform.position));
  object.rotation.set(
    transform.rotation.x,
    transform.rotation.y,
    transform.rotation.z,
    transform.rotation.order,
  );
  object.scale.copy(toThreeVector(transform.scale));
  object.updateMatrix();
  object.updateMatrixWorld(true);
}

export function disposeObjectTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Points ||
      object instanceof THREE.Line
    ) {
      geometries.add(object.geometry);
      const entries = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of entries) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) disposeMaterial(material);
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose();
    if (value instanceof THREE.WebGLRenderTarget) value.dispose();
  }
  material.dispose();
}

function fromThreeVector(vector: THREE.Vector3): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function toThreeVector(vector: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}): THREE.Vector3 {
  return new THREE.Vector3(vector.x, vector.y, vector.z);
}

function sanitizePathSegment(value: string): string {
  return value.replaceAll('/', '_').replaceAll('\\', '_') || 'node';
}
