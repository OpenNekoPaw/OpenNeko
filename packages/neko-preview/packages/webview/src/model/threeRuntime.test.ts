import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createResourceFingerprint, createResourceRef } from '@neko/shared';
import {
  assertPurposeCaptureAllowed,
  configureModelRendererColorPipeline,
  collectNormalizedFacts,
  createExactUrlModifier,
  createGeometryMaterial,
  createRenderScheduler,
  disposeObjectTree,
  getModelGroundGridLayout,
  getModelCameraGuidePose,
  getModelPixelRatio,
  getOrbitDistanceBounds,
  promoteOpaqueBlendMaterials,
  projectModelViewOrientation,
  shouldApplyModelCameraPose,
} from './threeRuntime';

describe('Three model runtime helpers', () => {
  it('resolves only exact authorized URLs and rejects network or undeclared probes', () => {
    const resolve = createExactUrlModifier({
      source: createResourceRef({
        scope: 'project',
        provider: 'test',
        kind: 'media',
        source: { kind: 'file', projectRelativePath: 'model/scene.gltf' },
        fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'source' }),
      }),
      sourceFingerprint: 'source',
      format: 'gltf',
      entryUri: 'vscode-webview://authority/model/scene.gltf',
      uriMap: {
        'scene.gltf': 'vscode-webview://authority/model/scene.gltf',
        'scene.bin': 'vscode-webview://authority/model/scene.bin',
        'textures/base.png': 'vscode-webview://authority/model/textures/base.png',
      },
      sizeBytes: 100,
    });
    expect(resolve('scene.bin')).toBe('vscode-webview://authority/model/scene.bin');
    expect(resolve('vscode-webview://authority/model/textures/base.png')).toBe(
      'vscode-webview://authority/model/textures/base.png',
    );
    expect(resolve('data:image/png;base64,AA==')).toBe('data:image/png;base64,AA==');
    const embeddedTexture = 'blob:vscode-webview://authority/2f3dbd0d-11ad-4d4c-96ac-71d0f9db8f4e';
    expect(resolve(embeddedTexture)).toBe(embeddedTexture);
    expect(() => resolve('https://example.com/secret.png')).toThrow(/rejected unresolved URL/);
    expect(() => resolve('undeclared.png')).toThrow(/rejected unresolved URL/);
  });

  it('calculates deterministic bounds and recursively disposes GPU-owned resources', () => {
    const geometry = new THREE.BoxGeometry(2, 4, 6);
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    const facts = collectNormalizedFacts(root, new THREE.Box3().setFromObject(root), 2);

    expect(facts).toMatchObject({
      nodeCount: 2,
      meshCount: 1,
      materialCount: 1,
      animationCount: 2,
      bounds: { size: { x: 2, y: 4, z: 6 } },
    });
    disposeObjectTree(root);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });

  it('preserves geometry vertex colors and uses a hue-preserving output pipeline', () => {
    const coloredGeometry = new THREE.BufferGeometry();
    coloredGeometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1], 3),
    );
    const coloredMaterial = createGeometryMaterial(coloredGeometry);
    const plainMaterial = createGeometryMaterial(new THREE.BufferGeometry());
    const renderer = {
      outputColorSpace: THREE.LinearSRGBColorSpace,
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 0,
    };

    configureModelRendererColorPipeline(renderer);

    expect(coloredMaterial.vertexColors).toBe(true);
    expect(coloredMaterial.color.getHex()).toBe(0xffffff);
    expect(plainMaterial.vertexColors).toBe(false);
    expect(renderer).toEqual({
      outputColorSpace: THREE.SRGBColorSpace,
      toneMapping: THREE.NeutralToneMapping,
      toneMappingExposure: 1,
    });
  });

  it('coalesces invalidations and stops rendering while the viewport is idle', () => {
    const pending = new Map<number, FrameRequestCallback>();
    let nextFrameId = 0;
    const render = vi.fn(() => false);
    const scheduler = createRenderScheduler(
      render,
      (callback) => {
        const frameId = ++nextFrameId;
        pending.set(frameId, callback);
        return frameId;
      },
      (frameId) => pending.delete(frameId),
    );

    scheduler.request();
    scheduler.request();
    expect(pending).toHaveLength(1);
    const firstFrame = [...pending.entries()][0];
    expect(firstFrame).toBeDefined();
    pending.delete(firstFrame![0]);
    firstFrame![1](16);
    expect(render).toHaveBeenCalledOnce();
    expect(pending).toHaveLength(0);

    render.mockReturnValueOnce(true);
    scheduler.request();
    const activeFrame = [...pending.entries()][0];
    expect(activeFrame).toBeDefined();
    pending.delete(activeFrame![0]);
    activeFrame![1](32);
    expect(pending).toHaveLength(1);

    scheduler.dispose();
    expect(pending).toHaveLength(0);
  });

  it('keeps orbit navigation outside model bounds', () => {
    expect(getOrbitDistanceBounds(4)).toEqual({ minDistance: 4.2, maxDistance: 80 });
  });

  it('applies camera pose only for initial projection or an explicit preset change', () => {
    expect(shouldApplyModelCameraPose(undefined, 'camera-front')).toBe(true);
    expect(shouldApplyModelCameraPose('camera-front', 'camera-front')).toBe(false);
    expect(shouldApplyModelCameraPose('camera-front', 'camera-default')).toBe(true);
  });

  it('anchors a bounds-scaled ground grid below the model', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-2, -3, -1), new THREE.Vector3(2, 5, 1));
    expect(getModelGroundGridLayout(bounds)).toEqual({
      size: 12,
      divisions: 24,
      y: -3.016,
    });
  });

  it('projects a temporary camera helper from normalized model bounds', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-1, -2, -1), new THREE.Vector3(1, 2, 1));
    const pose = getModelCameraGuidePose(bounds, {
      id: 'portrait',
      label: 'Portrait',
      position: { x: 0, y: 0.5, z: 2 },
      target: { x: 0, y: 1, z: 0 },
      fieldOfViewDeg: 35,
    });
    expect(pose.radius).toBeCloseTo(Math.sqrt(6));
    expect(pose.position.toArray()).toEqual([0, Math.sqrt(6) / 2, Math.sqrt(6) * 2]);
    expect(pose.target.toArray()).toEqual([0, 1, 0]);
  });

  it('projects world XYZ axes into screen-space orientation', () => {
    const orientation = projectModelViewOrientation(new THREE.Quaternion());
    expect(orientation.x).toEqual({ x: 1, y: -0, depth: 0 });
    expect(orientation.y).toEqual({ x: 0, y: -1, depth: 0 });
    expect(orientation.z).toEqual({ x: 0, y: -0, depth: 1 });
  });

  it('promotes fully opaque blend materials without changing real alpha layers', async () => {
    const opaqueTexture = new THREE.Texture();
    const alphaTexture = new THREE.Texture();
    const opaqueBlend = new THREE.MeshStandardMaterial({ map: opaqueTexture, transparent: true });
    const alphaBlend = new THREE.MeshStandardMaterial({ map: alphaTexture, transparent: true });
    const alphaMapBlend = new THREE.MeshStandardMaterial({
      map: opaqueTexture,
      alphaMap: alphaTexture,
      transparent: true,
    });
    opaqueBlend.depthWrite = false;
    alphaBlend.depthWrite = false;
    alphaMapBlend.depthWrite = false;
    const root = new THREE.Group();
    root.add(
      new THREE.Mesh(new THREE.BufferGeometry(), opaqueBlend),
      new THREE.Mesh(new THREE.BufferGeometry(), alphaBlend),
      new THREE.Mesh(new THREE.BufferGeometry(), alphaMapBlend),
    );

    await promoteOpaqueBlendMaterials(root, async (texture) => texture === alphaTexture);

    expect(opaqueBlend).toMatchObject({ transparent: false, depthWrite: true, version: 1 });
    expect(alphaBlend).toMatchObject({ transparent: true, depthWrite: false });
    expect(alphaMapBlend).toMatchObject({ transparent: true, depthWrite: false });
  });

  it('reduces render resolution only during direct manipulation', () => {
    expect(getModelPixelRatio(2, false)).toBe(1.5);
    expect(getModelPixelRatio(2, true)).toBe(1);
    expect(getModelPixelRatio(0.75, false)).toBe(0.75);
  });

  it('enforces output roles before capture', () => {
    expect(() =>
      assertPurposeCaptureAllowed({
        purpose: 'appearance',
        loadedReferenceKind: 'guide-only',
        hasPoseRuntime: true,
        hasPanorama: false,
      }),
    ).toThrow(/cannot produce appearance/i);
    expect(() =>
      assertPurposeCaptureAllowed({
        purpose: 'pose',
        loadedReferenceKind: 'source-model',
        hasPoseRuntime: false,
        hasPanorama: false,
      }),
    ).toThrow(/articulated/i);
    expect(() =>
      assertPurposeCaptureAllowed({
        purpose: 'panorama-scene',
        loadedReferenceKind: undefined,
        hasPoseRuntime: false,
        hasPanorama: false,
      }),
    ).toThrow(/requires a staged panorama/i);
    expect(() =>
      assertPurposeCaptureAllowed({
        purpose: 'appearance',
        loadedReferenceKind: 'source-model',
        hasPoseRuntime: false,
        hasPanorama: false,
      }),
    ).not.toThrow();
  });
});
