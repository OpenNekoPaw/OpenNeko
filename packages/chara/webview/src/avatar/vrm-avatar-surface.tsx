import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type {
  CharacterAvatarResourceDescriptor,
  CharacterVoiceTimingProjection,
} from '@neko/chara-domain/contracts';

export interface VrmAvatarRuntime {
  setVoiceTiming(timing: CharacterVoiceTimingProjection | undefined): void;
  dispose(): void;
}

export type CreateVrmAvatarRuntime = (input: {
  readonly container: HTMLElement;
  readonly descriptor: CharacterAvatarResourceDescriptor;
  readonly onDiagnostic: (message: string) => void;
}) => Promise<VrmAvatarRuntime>;

export function VrmAvatarSurface({
  descriptor,
  voiceTiming,
  createRuntime = createThreeVrmAvatarRuntime,
  onDiagnostic,
}: {
  readonly descriptor: CharacterAvatarResourceDescriptor;
  readonly voiceTiming?: CharacterVoiceTimingProjection;
  readonly createRuntime?: CreateVrmAvatarRuntime;
  readonly onDiagnostic?: (message: string) => void;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<VrmAvatarRuntime>();
  const voiceTimingRef = useRef(voiceTiming);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) throw new Error('VRM Avatar container is unavailable.');
    let active = true;
    let opened: VrmAvatarRuntime | undefined;
    void createRuntime({
      container,
      descriptor,
      onDiagnostic: (message) => {
        if (active) onDiagnostic?.(message);
      },
    })
      .then((runtime) => {
        if (!active) {
          runtime.dispose();
          return;
        }
        opened = runtime;
        runtimeRef.current = runtime;
        runtime.setVoiceTiming(voiceTimingRef.current);
      })
      .catch((error: unknown) => {
        if (active) {
          onDiagnostic?.(
            error instanceof Error ? error.message : 'The VRM Avatar runtime could not start.',
          );
        }
      });
    return () => {
      active = false;
      runtimeRef.current = undefined;
      opened?.dispose();
    };
  }, [createRuntime, descriptor, onDiagnostic]);

  useEffect(() => {
    voiceTimingRef.current = voiceTiming;
    runtimeRef.current?.setVoiceTiming(voiceTiming);
  }, [voiceTiming]);

  return (
    <div
      className="character-vrm-avatar"
      data-character-vrm-runtime="true"
      data-avatar-resource-lease-id={descriptor.avatarResourceLeaseId}
      ref={containerRef}
    />
  );
}

async function createThreeVrmAvatarRuntime(input: {
  readonly container: HTMLElement;
  readonly descriptor: CharacterAvatarResourceDescriptor;
  readonly onDiagnostic: (message: string) => void;
}): Promise<VrmAvatarRuntime> {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  input.container.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x334155, 2.1);
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2, 3, 4);
  scene.add(ambient, key);

  let disposed = false;
  let frame = 0;
  let timing: CharacterVoiceTimingProjection | undefined;
  let timingStartedAt = 0;
  let model: THREE.Object3D | undefined;
  const morphTargets: Array<{
    readonly dictionary: Record<string, number>;
    readonly influences: number[];
  }> = [];
  const resize = (): void => {
    const width = Math.max(1, input.container.clientWidth);
    const height = Math.max(1, input.container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(input.container);
  resize();

  try {
    const gltf = await new GLTFLoader().loadAsync(input.descriptor.url);
    if (disposed) {
      disposeObjectTree(gltf.scene);
      throw new Error('The VRM Avatar Scene was closed while loading.');
    }
    model = gltf.scene;
    scene.add(model);
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        morphTargets.push({
          dictionary: mesh.morphTargetDictionary,
          influences: mesh.morphTargetInfluences,
        });
      }
    });
    frameAvatar(model, camera);
  } catch (error) {
    observer.disconnect();
    if (model) {
      disposeObjectTree(model);
      model = undefined;
    }
    renderer.dispose();
    renderer.forceContextLoss();
    input.container.replaceChildren();
    throw error;
  }

  const render = (now: number): void => {
    if (disposed) return;
    applyVoiceTiming(morphTargets, timing, now - timingStartedAt);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);

  return {
    setVoiceTiming(nextTiming) {
      timing = nextTiming;
      timingStartedAt = performance.now();
      if (!nextTiming) resetMorphTargets(morphTargets);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resetMorphTargets(morphTargets);
      if (model) disposeObjectTree(model);
      renderer.dispose();
      renderer.forceContextLoss();
      input.container.replaceChildren();
    },
  };
}

function frameAvatar(model: THREE.Object3D, camera: THREE.PerspectiveCamera): void {
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) throw new Error('The VRM Avatar contains no renderable model bounds.');
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.position.y += size.y / 2;
  const distance = Math.max(size.y * 1.25, size.x * 2.2, 1);
  camera.position.set(0, size.y * 0.52, distance);
  camera.lookAt(0, size.y * 0.48, 0);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = Math.max(100, distance * 10);
  camera.updateProjectionMatrix();
}

function applyVoiceTiming(
  targets: readonly {
    readonly dictionary: Record<string, number>;
    readonly influences: number[];
  }[],
  timing: CharacterVoiceTimingProjection | undefined,
  elapsedMs: number,
): void {
  resetMorphTargets(targets);
  const viseme = timing?.visemes.find(
    (candidate) =>
      elapsedMs >= candidate.offsetMs && elapsedMs < candidate.offsetMs + candidate.durationMs,
  );
  if (!viseme) return;
  const aliases = visemeAliases(viseme.value);
  for (const target of targets) {
    for (const [name, index] of Object.entries(target.dictionary)) {
      if (aliases.has(normalizeViseme(name))) target.influences[index] = 1;
    }
  }
}

function resetMorphTargets(targets: readonly { readonly influences: number[] }[]): void {
  for (const target of targets) target.influences.fill(0);
}

function visemeAliases(value: string): ReadonlySet<string> {
  const normalized = normalizeViseme(value);
  const aliases: Record<string, readonly string[]> = {
    a: ['a', 'aa', 'ah', 'moutha', 'fclmtha'],
    e: ['e', 'ee', 'mouth e', 'mouthe', 'fclmthe'],
    i: ['i', 'ih', 'mouthi', 'fclmthi'],
    o: ['o', 'oh', 'moutho', 'fclmtho'],
    u: ['u', 'ou', 'mouthu', 'fclmthu'],
  };
  const vowel = Object.keys(aliases).find((key) => aliases[key]?.includes(normalized));
  return new Set(vowel ? aliases[vowel] : [normalized]);
}

function normalizeViseme(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/gu, '');
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
  root.removeFromParent();
}
