import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({ fsPath: filePath, path: filePath }),
    joinPath: (base: { path: string }, ...segments: string[]) => ({
      path: [base.path, ...segments].join('/'),
    }),
  },
  commands: { executeCommand: vi.fn() },
}));

vi.mock('../../utils/html', () => ({
  getWebviewHtml: vi.fn(() => '<html>panorama</html>'),
}));

vi.mock('../../services/PreviewService', () => ({
  PreviewService: { tryCreate: vi.fn() },
}));

import * as vscode from 'vscode';
import type { PreviewManifest } from '@neko/shared';
import { PanoramicImagePreviewProvider } from '../PanoramicImagePreviewProvider';

const MANIFEST: PreviewManifest = {
  manifestVersion: 1,
  assetId: 'asset-1',
  token: 'asset-1',
  kind: 'image',
  status: 'ready',
  sourceName: 'studio_360.jpg',
  sourceUrl: 'http://127.0.0.1:1234/v1/cut-media/file/token',
  createdAt: '2026-07-26T00:00:00.000Z',
  media: {
    mimeType: 'image/jpeg',
    fileSizeBytes: 1024,
    dynamicRange: 'sdr',
    dimensions: { width: 4096, height: 2048 },
    codec: { imageFormat: 'jpeg' },
  },
  projection: {
    type: 'equirectangular',
    source: 'filename',
    confidence: 'trusted-filename',
  },
  variants: [],
};

describe('PanoramicImagePreviewProvider Node media path', () => {
  let service: ReturnType<typeof createService>;
  let statusBar: ReturnType<typeof createStatusBar>;
  let provider: PanoramicImagePreviewProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
    statusBar = createStatusBar();
    provider = new PanoramicImagePreviewProvider(
      vscode.Uri.file('/extension'),
      statusBar as never,
      async () => service as never,
    );
  });

  it('registers a tokenized image and never sends the source file path', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'ready' });

    expect(service.registerPreviewAsset).toHaveBeenCalledWith({
      source: '/media/studio_360.jpg',
      kind: 'image',
      explicitOpen: true,
    });
    const init = panel.webview.postMessage.mock.calls[0]?.[0];
    expect(init).toEqual({ type: 'panorama:init', payload: { manifest: MANIFEST } });
    expect(JSON.stringify(init)).not.toContain('/media/studio_360.jpg');
    expect(JSON.stringify(init)).not.toContain('engineBaseUrl');
  });

  it('persists explicit projection metadata and publishes the updated manifest', async () => {
    const updated: PreviewManifest = {
      ...MANIFEST,
      projection: { type: 'cylindrical', source: 'manual', confidence: 'manual' },
    };
    service.updatePreviewAssetMetadata.mockResolvedValueOnce(updated);
    const { panel, message } = await resolve(provider);
    await message({ type: 'ready' });
    await message({ type: 'panorama:confirmProjection', projectionType: 'cylindrical' });

    expect(service.updatePreviewAssetMetadata).toHaveBeenCalledWith('asset-1', {
      projectionType: 'cylindrical',
    });
    expect(panel.webview.postMessage).toHaveBeenLastCalledWith({
      type: 'panorama:init',
      payload: { manifest: updated },
    });
  });

  it('requests derived variants through PreviewService', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'ready' });
    await message({
      type: 'panorama:requestVariant',
      request: { role: 'thumbnail', width: 320, height: 180 },
    });

    expect(service.requestPreviewVariant).toHaveBeenCalledWith('asset-1', {
      role: 'thumbnail',
      width: 320,
      height: 180,
    });
    expect(panel.webview.postMessage).toHaveBeenLastCalledWith({
      type: 'panorama:variantReady',
      payload: {
        variant: {
          id: 'variant-1',
          assetId: 'asset-1',
          role: 'thumbnail',
          url: 'data:image/jpeg;base64,variant',
        },
      },
    });
  });

  it('unregisters the token when the panel is disposed', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'ready' });
    const dispose = panel.onDidDispose.mock.calls[0]?.[0] as () => void;
    dispose();

    await vi.waitFor(() => expect(service.unregisterPreviewAsset).toHaveBeenCalledWith('asset-1'));
  });
});

function createService() {
  return {
    isAvailable: true,
    registerPreviewAsset: vi.fn().mockResolvedValue(MANIFEST),
    updatePreviewAssetMetadata: vi.fn().mockResolvedValue(MANIFEST),
    requestPreviewVariant: vi.fn().mockResolvedValue({
      id: 'variant-1',
      assetId: 'asset-1',
      role: 'thumbnail',
      url: 'data:image/jpeg;base64,variant',
    }),
    unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
  };
}

function createStatusBar() {
  return { show: vi.fn(), hide: vi.fn(), updatePlayback: vi.fn(), dispose: vi.fn() };
}

async function resolve(provider: PanoramicImagePreviewProvider) {
  const panel = createPanel();
  await provider.resolveCustomEditor(
    { uri: vscode.Uri.file('/media/studio_360.jpg'), dispose: vi.fn() },
    panel as never,
    {} as never,
  );
  const message = panel.webview.onDidReceiveMessage.mock.calls[0]?.[0] as (
    value: Record<string, unknown>,
  ) => Promise<void>;
  return { panel, message };
}

function createPanel() {
  return {
    webview: {
      options: {},
      html: '',
      cspSource: 'https://webview.csp',
      asWebviewUri: vi.fn((uri: { path: string }) => uri.path),
      onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
      postMessage: vi.fn().mockResolvedValue(true),
    },
    onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
  };
}
