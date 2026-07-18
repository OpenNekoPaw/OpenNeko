import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THREE_REFERENCE_STAGING_SCHEMA_VERSION,
  type ThreeReferenceStagingSnapshot,
} from '@neko/shared';
import * as vscode from 'vscode';

const vscodeMocks = vi.hoisted(() => ({
  createDirectory: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('vscode', () => {
  const createUri = (filePath: string) => ({
    scheme: 'file',
    fsPath: filePath,
    path: filePath,
    toString: () => filePath,
  });
  return {
    Uri: {
      file: createUri,
      joinPath: (base: { readonly fsPath: string }, ...segments: readonly string[]) =>
        createUri([base.fsPath, ...segments].join('/')),
    },
    workspace: {
      fs: {
        createDirectory: vscodeMocks.createDirectory,
        writeFile: vscodeMocks.writeFile,
      },
    },
  };
});

import { decodePngDataUrl } from './threeReferenceCaptureEncoding';
import {
  materializeThreeReferenceCapture,
  resolveThreeReferenceCaptureWorkspaceUri,
} from './threeReferenceCaptureMaterialization';

describe('3D Reference capture materialization', () => {
  beforeEach(() => {
    vscodeMocks.createDirectory.mockReset();
    vscodeMocks.writeFile.mockReset();
  });

  it('accepts bounded PNG bytes and rejects mislabeled payloads', () => {
    expect(decodePngDataUrl('data:image/png;base64,iVBORw0KGgo=')).toHaveLength(8);
    expect(() => decodePngDataUrl('data:image/png;base64,AA==')).toThrow(/PNG signature/);
    expect(() => decodePngDataUrl('data:image/jpeg;base64,iVBORw0KGgo=')).toThrow(/not a PNG/);
  });

  it('writes capture sources into the owning workspace resource cache', async () => {
    const registerPreviewAsset = vi.fn(async () => ({ assetId: 'capture-asset' }));

    const result = await materializeThreeReferenceCapture({
      request: captureRequest(sourceModelStaging('/workspace-b/character.glb')),
      workspaceUri: vscode.Uri.file('/workspace-b'),
      resolvePreviewService: async () => ({ isAvailable: true, registerPreviewAsset }),
    });

    const expectedPath =
      '/workspace-b/.neko/.cache/resources/three-reference-captures/session-1-6-appearance-capture-1.png';
    expect(vscodeMocks.createDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: '/workspace-b/.neko/.cache/resources/three-reference-captures',
      }),
    );
    expect(vscodeMocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: expectedPath }),
      expect.any(Uint8Array),
    );
    expect(registerPreviewAsset).toHaveBeenCalledWith({ source: expectedPath, kind: 'image' });
    expect(result).toMatchObject({
      scope: 'project',
      source: { filePath: expectedPath, previewAssetId: 'capture-asset' },
    });
  });

  it('selects the workspace that owns a model or panorama source', () => {
    const workspaceA = { uri: vscode.Uri.file('/workspace-a') };
    const workspaceB = { uri: vscode.Uri.file('/workspace-b') };
    const getWorkspaceFolder = vi.fn((sourceUri: { readonly fsPath: string }) =>
      sourceUri.fsPath.startsWith('/workspace-b/') ? workspaceB : undefined,
    );

    expect(
      resolveThreeReferenceCaptureWorkspaceUri({
        request: captureRequest(sourceModelStaging('/workspace-b/character.glb')),
        workspaceFolders: [workspaceA, workspaceB],
        getWorkspaceFolder,
      }).fsPath,
    ).toBe('/workspace-b');
  });

  it('rejects missing or ambiguous workspace ownership before materialization', () => {
    const request = captureRequest(builtinStaging());
    expect(() =>
      resolveThreeReferenceCaptureWorkspaceUri({
        request,
        workspaceFolders: [],
        getWorkspaceFolder: () => undefined,
      }),
    ).toThrow(/requires an open workspace/);
    expect(() =>
      resolveThreeReferenceCaptureWorkspaceUri({
        request,
        workspaceFolders: [
          { uri: vscode.Uri.file('/workspace-a') },
          { uri: vscode.Uri.file('/workspace-b') },
        ],
        getWorkspaceFolder: () => undefined,
      }),
    ).toThrow(/cannot choose between multiple workspace folders/);
    expect(vscodeMocks.writeFile).not.toHaveBeenCalled();
  });
});

function captureRequest(staging: ThreeReferenceStagingSnapshot) {
  return {
    requestId: 'capture-1',
    identity: { sessionId: staging.sessionId, revision: staging.revision },
    purpose: 'appearance' as const,
    imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    width: 1024,
    height: 1024,
    staging,
    signal: new AbortController().signal,
  };
}

function sourceModelStaging(sourcePath: string): ThreeReferenceStagingSnapshot {
  return {
    ...baseStaging(),
    subject: {
      kind: 'source-model',
      source: {
        id: 'source-model',
        scope: 'project',
        provider: 'source-file',
        kind: 'media',
        source: { kind: 'file', filePath: sourcePath },
        locator: { kind: 'file', path: sourcePath },
        fingerprint: { strategy: 'identity', value: 'source-model' },
      },
      fingerprint: 'source-model',
      format: 'glb',
    },
  };
}

function builtinStaging(): ThreeReferenceStagingSnapshot {
  return {
    ...baseStaging(),
    subject: {
      kind: 'builtin-preset',
      presetId: 'guide-neutral-mannequin',
      presetVersion: 1,
      fingerprint: 'builtin',
      presetKind: 'mannequin',
      appearancePolicy: 'guide-only',
      allowedPurposes: ['pose', 'camera'],
    },
  };
}

function baseStaging(): Omit<ThreeReferenceStagingSnapshot, 'subject'> {
  return {
    schemaVersion: THREE_REFERENCE_STAGING_SCHEMA_VERSION,
    sessionId: 'session-1',
    revision: 6,
    selectedPurposes: ['appearance'],
    camera: {
      cameraId: 'front',
      position: { x: 0, y: 0, z: 3.5 },
      target: { x: 0, y: 0, z: 0 },
      fieldOfViewDeg: 45,
      aspectRatio: 1,
    },
  };
}
