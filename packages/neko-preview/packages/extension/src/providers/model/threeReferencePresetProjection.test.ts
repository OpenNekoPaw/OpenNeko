import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { fsPath: string }, ...segments: string[]) => ({
      fsPath: [base.fsPath, ...segments].join('/'),
    }),
  },
}));

import { projectThreeReferencePresetRuntime } from './threeReferencePresetProjection';
import type { ThreeReferencePresetCatalogEntry } from './threeReferencePresetCatalog';

describe('3D Reference preset runtime projection', () => {
  it('projects procedural identity without inventing a local resource URI', async () => {
    const authorization = authorizationPort();
    const runtime = await projectThreeReferencePresetRuntime({
      entry: proceduralEntry(),
      webview: webviewPort(),
      extensionUri: { fsPath: '/extension' } as never,
      authorization,
      signal: new AbortController().signal,
    });
    expect(runtime).toEqual({
      kind: 'procedural',
      implementationId: 'neutral-mannequin-v1',
      poseCapabilities: {
        posePresets: [
          {
            poseId: 'standing',
            labelKey: 'preview.model.posePreset.standing',
            joints: [{ jointId: 'hips', rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } }],
          },
        ],
        joints: [],
      },
    });
    expect(authorization.toWebviewUri).not.toHaveBeenCalled();
  });

  it('authorizes and projects only exact catalog-declared packaged dependencies', async () => {
    const authorization = authorizationPort();
    const runtime = await projectThreeReferencePresetRuntime({
      entry: packagedEntry(),
      webview: webviewPort(),
      extensionUri: { fsPath: '/extension' } as never,
      authorization,
      signal: new AbortController().signal,
    });
    expect(authorization.configureWebview).toHaveBeenCalledOnce();
    expect(authorization.toWebviewUri).toHaveBeenCalledWith(
      expect.anything(),
      '/extension/dist/webview/assets/3d-reference/test.glb',
      { caller: '3d-reference-preset:packaged-test' },
    );
    expect(runtime).toEqual({
      kind: 'packaged',
      entryDependencyId: 'model',
      dependencies: [
        {
          dependencyId: 'model',
          uri: 'webview:/extension/dist/webview/assets/3d-reference/test.glb',
          mediaType: 'model/gltf-binary',
          sha256: 'abc123',
        },
      ],
    });
  });

  it('fails visibly when an exact packaged dependency is not authorized', async () => {
    const authorization = authorizationPort({ ok: false });
    await expect(
      projectThreeReferencePresetRuntime({
        entry: packagedEntry(),
        webview: webviewPort(),
        extensionUri: { fsPath: '/extension' } as never,
        authorization,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/not authorized/i);
  });
});

function proceduralEntry(): ThreeReferencePresetCatalogEntry {
  return {
    presetId: 'procedural-test',
    presetVersion: 1,
    fingerprint: 'sha256:procedural',
    presetKind: 'mannequin',
    appearancePolicy: 'guide-only',
    allowedPurposes: ['pose'],
    labelKey: 'test',
    defaultScale: 1,
    runtime: { kind: 'procedural', implementationId: 'neutral-mannequin-v1' },
    poseCapabilities: {
      posePresets: [
        {
          poseId: 'standing',
          labelKey: 'preview.model.posePreset.standing',
          joints: [{ jointId: 'hips', rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } }],
        },
      ],
      joints: [],
    },
    renderPasses: ['pose-skeleton'],
    packagedDependencies: [],
    provenance: { origin: 'project-authored', author: 'OpenNeko', source: 'test' },
    license: { spdxId: 'LicenseRef-OpenNeko', redistribution: 'project-owned', notice: 'test' },
  };
}

function packagedEntry(): ThreeReferencePresetCatalogEntry {
  return {
    ...proceduralEntry(),
    presetId: 'packaged-test',
    runtime: { kind: 'packaged', entryDependencyId: 'model' },
    packagedDependencies: [
      {
        dependencyId: 'model',
        packageRelativePath: 'dist/webview/assets/3d-reference/test.glb',
        mediaType: 'model/gltf-binary',
        sha256: 'abc123',
      },
    ],
  };
}

function authorizationPort(result: { ok: boolean } = { ok: true }) {
  return {
    configureWebview: vi.fn(async () => undefined),
    toWebviewUri: vi.fn(async (_webview, source: string) =>
      result.ok
        ? { ok: true as const, kind: 'local' as const, source, uri: `webview:${source}` }
        : {
            ok: false as const,
            reason: 'unauthorized' as const,
            source,
            message: 'not authorized',
          },
    ),
  } as never;
}

function webviewPort() {
  return { options: {}, asWebviewUri: vi.fn() } as never;
}
