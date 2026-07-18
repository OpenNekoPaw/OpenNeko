import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type {
  ModelPreviewCaptureSettings,
  ModelPreviewSourceDescriptor,
  ModelPreviewStagingState,
  ModelPreviewTransform,
  NormalizedModelFacts,
} from '@neko/shared';

export interface ModelPreviewNode {
  readonly path: string;
  readonly label: string;
  readonly mesh: boolean;
  readonly transform: ModelPreviewTransform;
}

export interface ThreeModelRuntimeCallbacks {
  readonly onTransformChanged?: (nodePath: string, transform: ModelPreviewTransform) => void;
  readonly onDiagnostic?: (message: string) => void;
}

export interface ThreeModelRuntimePort {
  load(source: ModelPreviewSourceDescriptor): Promise<NormalizedModelFacts>;
  applyStaging(staging: ModelPreviewStagingState): void;
  getNodes(): readonly ModelPreviewNode[];
  setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void;
  setTransformEnabled(enabled: boolean): void;
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

class BrowserThreeModelRuntime implements ThreeModelRuntimePort {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly orbit: OrbitControls;
  private readonly transform: TransformControls;
  private readonly transformHelper: THREE.Object3D;
  private readonly renderScheduler: RenderScheduler;
  private readonly environmentLight = new THREE.HemisphereLight(0xffffff, 0x202020, 0.7);
  private readonly directionalLights = new Map<string, THREE.DirectionalLight>();
  private readonly callbacks: ThreeModelRuntimeCallbacks;
  private readonly nodes = new Map<string, THREE.Object3D>();
  private readonly paths = new WeakMap<THREE.Object3D, string>();
  private modelRoot: THREE.Object3D | undefined;
  private modelBounds: THREE.Box3 | undefined;
  private selectedNodePath: string | undefined;
  private transformEnabled = false;
  private facts: NormalizedModelFacts | undefined;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private interactionDepth = 0;
  private loadEpoch = 0;
  private disposed = false;
  private readonly requestRender = (): void => this.renderScheduler.request();
  private readonly commitTransformChange = (): void => this.emitTransformChange();
  private readonly handleTransformDraggingChanged = (event: { readonly value: unknown }): void => {
    const dragging = event.value === true;
    this.orbit.enabled = !dragging;
    if (dragging) this.beginInteraction();
    else this.endInteraction();
  };
  private readonly beginOrbitInteraction = (): void => this.beginInteraction();
  private readonly endOrbitInteraction = (): void => this.endInteraction();

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
    this.transform.addEventListener('change', this.requestRender);
    this.transform.addEventListener('mouseUp', this.commitTransformChange);
    this.orbit.addEventListener('change', this.requestRender);
    this.orbit.addEventListener('start', this.beginOrbitInteraction);
    this.orbit.addEventListener('end', this.endOrbitInteraction);
    this.scene.add(this.environmentLight, this.transformHelper);
    for (const id of ['key', 'fill', 'rim']) {
      const light = new THREE.DirectionalLight(0xffffff, 1);
      this.directionalLights.set(id, light);
      this.scene.add(light);
    }
    this.camera.position.set(3, 2, 3);
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
    this.scene.add(loaded.root);
    this.indexNodes(loaded.root);
    this.facts = collectNormalizedFacts(loaded.root, bounds, loaded.animationCount);
    this.frameBounds(bounds);
    return this.facts;
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
    const selected = staging.selectedNodePath
      ? this.nodes.get(staging.selectedNodePath)
      : undefined;
    if (selected && this.transformEnabled) this.transform.attach(selected);
    else this.transform.detach();
    const camera = staging.cameraPresets.find(
      (candidate) => candidate.id === staging.activeCameraId,
    );
    if (!camera)
      throw new Error(`Active Model Preview camera is missing: ${staging.activeCameraId}`);
    const radius = Math.max(facts.bounds.radius, 0.001);
    const center = toThreeVector(facts.bounds.center);
    this.camera.fov = camera.fieldOfViewDeg;
    this.camera.position.copy(center).addScaledVector(toThreeVector(camera.position), radius);
    this.camera.updateProjectionMatrix();
    this.orbit.target.copy(center).add(toThreeVector(camera.target));
    this.orbit.update();
    this.environmentLight.intensity = staging.lightRig.environmentIntensity;
    for (const entry of staging.lightRig.lights) {
      const light = this.directionalLights.get(entry.id);
      if (!light) throw new Error(`Model Preview light is missing: ${entry.id}`);
      light.color.set(entry.color);
      light.intensity = entry.intensity;
      light.position.copy(center).addScaledVector(toThreeVector(entry.position), radius);
      light.target.position.copy(center);
      if (!light.target.parent) this.scene.add(light.target);
    }
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
    this.transform.setMode(mode);
  }

  setTransformEnabled(enabled: boolean): void {
    this.assertLive();
    this.transformEnabled = enabled;
    const selected = this.selectedNodePath ? this.nodes.get(this.selectedNodePath) : undefined;
    if (enabled && selected) this.transform.attach(selected);
    else this.transform.detach();
    this.requestRender();
  }

  frameModel(): void {
    this.assertLive();
    if (!this.modelBounds) throw new Error('Model Preview renderer has no loaded model bounds.');
    this.frameBounds(this.modelBounds);
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
    if (!this.modelRoot) throw new Error('Model Preview renderer has no loaded model.');
    const previousSize = new THREE.Vector2();
    this.renderer.getSize(previousSize);
    const previousPixelRatio = this.renderer.getPixelRatio();
    const previousAspect = this.camera.aspect;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(settings.width, settings.height, false);
    this.camera.aspect = settings.width / settings.height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');
    this.renderer.setPixelRatio(previousPixelRatio);
    this.renderer.setSize(previousSize.x, previousSize.y, false);
    this.camera.aspect = previousAspect;
    this.camera.updateProjectionMatrix();
    if (!dataUrl.startsWith('data:image/png;base64,')) {
      throw new Error('Model Preview canvas did not produce a PNG capture.');
    }
    return dataUrl;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadEpoch += 1;
    this.renderScheduler.dispose();
    this.transform.removeEventListener('dragging-changed', this.handleTransformDraggingChanged);
    this.transform.removeEventListener('change', this.requestRender);
    this.transform.removeEventListener('mouseUp', this.commitTransformChange);
    this.orbit.removeEventListener('change', this.requestRender);
    this.orbit.removeEventListener('start', this.beginOrbitInteraction);
    this.orbit.removeEventListener('end', this.endOrbitInteraction);
    this.transform.detach();
    this.transform.dispose();
    this.scene.remove(this.transformHelper);
    this.orbit.dispose();
    this.detachModel();
    for (const light of this.directionalLights.values()) {
      this.scene.remove(light, light.target);
    }
    this.scene.remove(this.environmentLight);
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private frameBounds(bounds: THREE.Box3): void {
    this.modelBounds = bounds.clone();
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.001);
    this.camera.near = Math.max(radius / 1000, 0.001);
    this.camera.far = Math.max(radius * 100, 100);
    this.camera.position.copy(center).add(new THREE.Vector3(2.5, 1.8, 2.5).multiplyScalar(radius));
    this.camera.updateProjectionMatrix();
    this.orbit.target.copy(center);
    const distanceBounds = getOrbitDistanceBounds(radius);
    this.orbit.minDistance = distanceBounds.minDistance;
    this.orbit.maxDistance = distanceBounds.maxDistance;
    this.orbit.update();
    this.requestRender();
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
    const nodePath = this.paths.get(object);
    if (!nodePath) return;
    this.callbacks.onTransformChanged?.(nodePath, serializeTransform(object));
  }

  private detachModel(): void {
    this.transform.detach();
    if (this.modelRoot) {
      this.scene.remove(this.modelRoot);
      disposeObjectTree(this.modelRoot);
    }
    this.modelRoot = undefined;
    this.modelBounds = undefined;
    this.selectedNodePath = undefined;
    this.facts = undefined;
    this.nodes.clear();
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('Model Preview Three runtime is disposed.');
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
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Points ||
      object instanceof THREE.Line
    ) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) disposeMaterial(material);
    }
  });
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
