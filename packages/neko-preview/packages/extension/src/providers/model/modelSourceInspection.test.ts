import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PathResolver } from '@neko/shared';
import {
  createPortableModelPath,
  inspectModelSource,
  ModelSourceInspectionError,
  type ModelSourceFileSystem,
} from './modelSourceInspection';

const workspace = path.resolve('/workspace/project');

describe('model source inspection', () => {
  it('creates portable workspace, variable-root, and opaque authorized refs', async () => {
    expect(
      createPortableModelPath({
        sourcePath: path.join(workspace, 'models/hero.glb'),
        workspaceRoot: workspace,
        authorizedRoots: [workspace],
      }),
    ).toBe('${WORKSPACE}/models/hero.glb');
    expect(
      createPortableModelPath({
        sourcePath: '/media/library/hero.glb',
        pathResolver: new PathResolver(new Map([['MEDIA', '/media/library']])),
        authorizedRoots: ['/media/library'],
      }),
    ).toBe('${MEDIA}/hero.glb');
    expect(
      createPortableModelPath({
        sourcePath: '/external/authorized/hero.glb',
        authorizedRoots: ['/external/authorized'],
      }),
    ).toMatch(/^model-preview:\/\/authorized\/[a-f0-9]{16}\/hero\.glb$/);
  });

  it('validates GLB, STL, and PLY as primary-only sources', async () => {
    for (const [fileName, content] of [
      ['hero.glb', glb()],
      ['mesh.stl', ascii('solid mesh\nfacet normal 0 0 1\nendsolid mesh')],
      ['cloud.ply', ascii('ply\nformat ascii 1.0\nend_header\n')],
    ] as const) {
      const sourcePath = path.join(workspace, fileName);
      const result = await inspectModelSource({
        sourcePath,
        workspaceRoot: workspace,
        authorizedRoots: [workspace],
        fileSystem: memoryFileSystem({ [sourcePath]: content }),
      });
      expect(result.dependencies).toHaveLength(1);
      expect(result.sourceRef.source.filePath).toBeUndefined();
      expect(result.sourceRef.source.uri).not.toContain('/workspace/project');
    }
  });

  it('enumerates exact glTF buffers and images while preserving embedded data', async () => {
    const sourcePath = path.join(workspace, 'model/scene.gltf');
    const bufferPath = path.join(workspace, 'model/scene.bin');
    const texturePath = path.join(workspace, 'model/textures/albedo.png');
    const result = await inspectModelSource({
      sourcePath,
      workspaceRoot: workspace,
      authorizedRoots: [workspace],
      fileSystem: memoryFileSystem({
        [sourcePath]: ascii(
          JSON.stringify({
            asset: { version: '2.0' },
            buffers: [{ uri: 'scene.bin' }],
            images: [{ uri: 'textures/albedo.png' }, { uri: 'data:image/png;base64,AA==' }],
          }),
        ),
        [bufferPath]: ascii('buffer'),
        [texturePath]: ascii('image'),
      }),
    });
    expect(result.dependencies.map((item) => item.reference)).toEqual([
      'scene.gltf',
      'scene.bin',
      'textures/albedo.png',
    ]);
  });

  it('enumerates OBJ material libraries and their declared textures', async () => {
    const sourcePath = path.join(workspace, 'model/mesh.obj');
    const materialPath = path.join(workspace, 'model/materials/mesh.mtl');
    const texturePath = path.join(workspace, 'model/materials/textures/base color.png');
    const result = await inspectModelSource({
      sourcePath,
      workspaceRoot: workspace,
      authorizedRoots: [workspace],
      fileSystem: memoryFileSystem({
        [sourcePath]: ascii('mtllib materials/mesh.mtl\nv 0 0 0\n'),
        [materialPath]: ascii('newmtl main\nmap_Kd "textures/base color.png"\n'),
        [texturePath]: ascii('image'),
      }),
    });
    expect(result.dependencies.map((item) => item.role)).toEqual([
      'primary',
      'material',
      'texture',
    ]);
  });

  it('rejects poisoned OBJ/MTL references and does not authorize undeclared textures', async () => {
    const sourcePath = path.join(workspace, 'model/mesh.obj');
    await expectInspectionCode(
      inspectModelSource({
        sourcePath,
        authorizedRoots: [workspace],
        fileSystem: memoryFileSystem({ [sourcePath]: ascii('mtllib ../secret.mtl\nv 0 0 0\n') }),
      }),
      'unsafe-dependency',
    );
    await expectInspectionCode(
      inspectModelSource({
        sourcePath,
        authorizedRoots: [workspace],
        fileSystem: memoryFileSystem({ [sourcePath]: ascii('mtllib missing.mtl\nv 0 0 0\n') }),
      }),
      'missing-dependency',
    );
    const materialPath = path.join(workspace, 'model/mesh.mtl');
    await expectInspectionCode(
      inspectModelSource({
        sourcePath,
        authorizedRoots: [workspace],
        fileSystem: memoryFileSystem({
          [sourcePath]: ascii('mtllib mesh.mtl\nv 0 0 0\n'),
          [materialPath]: ascii('newmtl main\nmap_Kd https://example.com/secret.png\n'),
        }),
      }),
      'unsafe-dependency',
    );
    const result = await inspectModelSource({
      sourcePath,
      authorizedRoots: [workspace],
      fileSystem: memoryFileSystem({
        [sourcePath]: ascii('mtllib mesh.mtl\nv 0 0 0\n'),
        [materialPath]: ascii('newmtl main\nKd 1 1 1\n'),
        [path.join(workspace, 'model/undeclared.png')]: ascii('not authorized'),
      }),
    });
    expect(result.dependencies.map((dependency) => dependency.reference)).toEqual([
      'mesh.obj',
      'mesh.mtl',
    ]);
  });

  it.each([
    ['remote', 'https://example.com/model.bin'],
    ['absolute', '/secrets/model.bin'],
    ['traversal', '../model.bin'],
  ])('rejects %s glTF dependencies before load', async (_label, reference) => {
    const sourcePath = path.join(workspace, 'scene.gltf');
    await expectInspectionCode(
      inspectModelSource({
        sourcePath,
        authorizedRoots: [workspace],
        fileSystem: memoryFileSystem({
          [sourcePath]: ascii(
            JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: reference }] }),
          ),
        }),
      }),
      'unsafe-dependency',
    );
  });

  it('rejects duplicate, missing, excessive, oversized, mismatched, and unauthorized sources', async () => {
    const sourcePath = path.join(workspace, 'scene.gltf');
    const duplicate = ascii(
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: 'scene.bin' }],
        images: [{ uri: 'scene.bin' }],
      }),
    );
    await expectInspectionCode(
      inspectModelSource({
        sourcePath,
        authorizedRoots: [workspace],
        fileSystem: memoryFileSystem({ [sourcePath]: duplicate }),
      }),
      'unsafe-dependency',
    );
    await expectInspectionCode(
      inspectModelSource({
        sourcePath,
        authorizedRoots: [workspace],
        fileSystem: memoryFileSystem({
          [sourcePath]: ascii(
            JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'missing.bin' }] }),
          ),
        }),
      }),
      'missing-dependency',
    );
    await expectInspectionCode(
      inspectModelSource({
        sourcePath,
        authorizedRoots: [workspace],
        limits: { maxDependencyCount: 0 },
        fileSystem: memoryFileSystem({
          [sourcePath]: ascii(
            JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'scene.bin' }] }),
          ),
          [path.join(workspace, 'scene.bin')]: ascii('buffer'),
        }),
      }),
      'dependency-limit-exceeded',
    );
    await expectInspectionCode(
      inspectModelSource({
        sourcePath: path.join(workspace, 'hero.glb'),
        authorizedRoots: [workspace],
        limits: { maxSourceBytes: 4 },
        fileSystem: memoryFileSystem({ [path.join(workspace, 'hero.glb')]: glb() }),
      }),
      'source-too-large',
    );
    await expectInspectionCode(
      inspectModelSource({
        sourcePath: path.join(workspace, 'hero.glb'),
        declaredMimeType: 'model/gltf+json',
        authorizedRoots: [workspace],
        fileSystem: memoryFileSystem({ [path.join(workspace, 'hero.glb')]: glb() }),
      }),
      'unsupported-format',
    );
    await expectInspectionCode(
      inspectModelSource({
        sourcePath: '/outside/hero.glb',
        authorizedRoots: [workspace],
        fileSystem: memoryFileSystem({ '/outside/hero.glb': glb() }),
      }),
      'source-unauthorized',
    );
  });

  it('honors cancellation during inspection', async () => {
    const sourcePath = path.join(workspace, 'hero.glb');
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(
      inspectModelSource({
        sourcePath,
        authorizedRoots: [workspace],
        fileSystem: memoryFileSystem({ [sourcePath]: glb() }),
        signal: controller.signal,
      }),
    ).rejects.toThrow('cancelled');
  });
});

function memoryFileSystem(files: Readonly<Record<string, Uint8Array>>): ModelSourceFileSystem {
  return {
    async stat(filePath, signal) {
      signal?.throwIfAborted();
      const content = files[filePath];
      if (!content) throw new Error('missing');
      return { size: content.byteLength, mtimeMs: 42, isFile: true };
    },
    async readFile(filePath, signal) {
      signal?.throwIfAborted();
      const content = files[filePath];
      if (!content) throw new Error('missing');
      return content;
    },
  };
}

async function expectInspectionCode(
  promise: Promise<unknown>,
  code: ModelSourceInspectionError['diagnostic']['code'],
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected inspection to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(ModelSourceInspectionError);
    expect((error as ModelSourceInspectionError).diagnostic.code).toBe(code);
  }
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function glb(): Uint8Array {
  const bytes = new Uint8Array(12);
  bytes.set(ascii('glTF'), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  return bytes;
}
