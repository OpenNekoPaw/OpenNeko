import { describe, expect, it, vi } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  MODEL_PREVIEW_STAGING_SCHEMA_VERSION,
} from '@neko/shared';

vi.mock('vscode', () => ({
  commands: {
    getCommands: vi.fn(async () => []),
    executeCommand: vi.fn(),
  },
}));

import {
  buildModelPreviewContextPayload,
  materializeModelPreviewCapture,
  ModelAgentContextBridge,
} from './modelAgentContext';
import type { ModelPreviewCaptureResult, ModelPreviewSourceDescriptor } from '@neko/shared';

describe('model Agent context bridge', () => {
  it('materializes a bounded rebuildable PNG without absolute source paths', async () => {
    const writes = new Map<string, Uint8Array>();
    const fileSystem = {
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async (filePath: string, bytes: Uint8Array) => {
        writes.set(filePath, bytes);
      }),
      rename: vi.fn(async (from: string, to: string) => {
        const bytes = writes.get(from);
        if (!bytes) throw new Error('missing temporary capture');
        writes.set(to, bytes);
        writes.delete(from);
      }),
      rm: vi.fn(async (filePath: string) => {
        writes.delete(filePath);
      }),
    };
    const capture = modelCapture();
    const source = modelSource();
    const ref = await materializeModelPreviewCapture({
      workspaceRoot: '/workspace/project',
      source,
      capture,
      fileSystem,
    });

    expect(ref).toMatchObject({
      provider: 'model-preview-capture',
      kind: 'preview',
      source: {
        kind: 'file',
        projectRelativePath: expect.stringMatching(/^\.neko\/\.cache\/model-preview\//),
        uri: expect.stringMatching(/^\$\{WORKSPACE\}\//),
        metadata: { rebuildable: true, mimeType: 'image/png' },
      },
    });
    expect(JSON.stringify(ref)).not.toContain('/workspace/project');
  });

  it('builds one validated model-preview payload with no runtime or routing fields', () => {
    const payload = buildModelPreviewContextPayload({
      source: modelSource(),
      capture: modelCapture(),
      previewImage: previewRef(),
    });
    expect(payload).toMatchObject({
      type: 'model-preview',
      data: {
        contractVersion: 1,
        sourceFingerprint: 'fingerprint-1',
        format: 'glb',
        previewImage: { id: 'preview-1' },
      },
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/vscode-webview|authorization|providerId|modelId|data:image/);
  });

  it('ends at neko.agent.sendContext and keeps Agent failures visible', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const bridge = new ModelAgentContextBridge({
      materialize: vi.fn(async () => previewRef()),
      getCommands: vi.fn(async () => ['neko.agent.sendContext']),
      executeCommand,
    });
    await bridge.deliver({
      workspaceRoot: '/workspace/project',
      source: modelSource(),
      capture: modelCapture(),
    });
    expect(executeCommand).toHaveBeenCalledWith(
      'neko.agent.sendContext',
      expect.objectContaining({ type: 'model-preview' }),
    );

    const unavailable = new ModelAgentContextBridge({
      materialize: vi.fn(async () => previewRef()),
      getCommands: vi.fn(async () => []),
    });
    await expect(
      unavailable.deliver({
        workspaceRoot: '/workspace/project',
        source: modelSource(),
        capture: modelCapture(),
      }),
    ).rejects.toMatchObject({ diagnostic: { code: 'agent-unavailable' } });
  });

  it('rejects stale capture identity and invalid PNG dimensions before delivery', async () => {
    const capture = modelCapture();
    await expect(
      materializeModelPreviewCapture({
        workspaceRoot: '/workspace/project',
        source: modelSource(),
        capture: {
          ...capture,
          metadata: { ...capture.metadata, sourceFingerprint: 'stale' },
        },
        fileSystem: {
          mkdir: vi.fn(),
          writeFile: vi.fn(),
          rename: vi.fn(),
          rm: vi.fn(),
        },
      }),
    ).rejects.toMatchObject({ diagnostic: { code: 'context-invalid' } });
  });
});

function modelSource(): ModelPreviewSourceDescriptor {
  return {
    protocolVersion: 1,
    source: createResourceRef({
      id: 'source-1',
      scope: 'project',
      provider: 'model-preview-source',
      kind: 'media',
      source: { kind: 'file', projectRelativePath: 'models/hero.glb' },
      fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'fingerprint-1' }),
    }),
    sourceFingerprint: 'fingerprint-1',
    format: 'glb',
    entryUri: 'vscode-webview:model.glb',
    uriMap: { 'hero.glb': 'vscode-webview:model.glb' },
    sizeBytes: 12,
  };
}

function modelCapture(): ModelPreviewCaptureResult {
  return {
    metadata: {
      sessionId: 'session-1',
      sourceFingerprint: 'fingerprint-1',
      revision: 2,
      mimeType: 'image/png',
      width: 64,
      height: 64,
      cameraId: 'camera-default',
    },
    dataUrl: `data:image/png;base64,${Buffer.from(pngHeader(64, 64)).toString('base64')}`,
    staging: {
      schemaVersion: MODEL_PREVIEW_STAGING_SCHEMA_VERSION,
      sessionId: 'session-1',
      sourceFingerprint: 'fingerprint-1',
      revision: 2,
      transformPatches: [],
      cameraPresets: [
        {
          id: 'camera-default',
          label: 'Default',
          position: { x: 3, y: 2, z: 3 },
          target: { x: 0, y: 0, z: 0 },
          fieldOfViewDeg: 45,
        },
      ],
      activeCameraId: 'camera-default',
      lightRig: {
        environmentIntensity: 1,
        lights: [
          { id: 'key', color: '#fff', intensity: 3, position: { x: 1, y: 2, z: 3 } },
          { id: 'fill', color: '#fff', intensity: 1, position: { x: -1, y: 1, z: 2 } },
          { id: 'rim', color: '#fff', intensity: 2, position: { x: 0, y: 2, z: -2 } },
        ],
      },
      background: '#1e1e1e',
      capture: { width: 64, height: 64 },
    },
    facts: {
      bounds: {
        min: { x: -1, y: -1, z: -1 },
        max: { x: 1, y: 1, z: 1 },
        center: { x: 0, y: 0, z: 0 },
        size: { x: 2, y: 2, z: 2 },
        radius: 1.7,
      },
      nodeCount: 2,
      meshCount: 1,
      materialCount: 1,
      animationCount: 0,
    },
  };
}

function previewRef() {
  return createResourceRef({
    id: 'preview-1',
    scope: 'project',
    provider: 'model-preview-capture',
    kind: 'preview',
    source: { kind: 'file', projectRelativePath: '.neko/.cache/model-preview/capture.png' },
    fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'capture' }),
  });
}

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
