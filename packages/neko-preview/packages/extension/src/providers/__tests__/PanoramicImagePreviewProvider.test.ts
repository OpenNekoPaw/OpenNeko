import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PreviewManifest } from '@neko/shared';

vi.mock('vscode', () => {
  const Uri = {
    file: (path: string) => ({ scheme: 'file', fsPath: path, path, toString: () => path }),
    joinPath: (base: { path: string }, ...segments: string[]) => {
      const joined = [base.path, ...segments].join('/');
      return { scheme: 'file', fsPath: joined, path: joined, toString: () => joined };
    },
  };
  return {
    Uri,
    commands: { executeCommand: vi.fn() },
    extensions: { getExtension: vi.fn() },
  };
});

vi.mock('../../utils/html', () => ({
  getWebviewHtml: vi.fn(() => '<html>panorama</html>'),
}));

vi.mock('../../services/PreviewService', () => ({
  PreviewService: {
    tryCreate: vi.fn(),
  },
}));

import * as vscode from 'vscode';
import { PanoramicImagePreviewProvider } from '../PanoramicImagePreviewProvider';
import { PreviewService } from '../../services/PreviewService';
import { getWebviewHtml } from '../../utils/html';

interface MockPanel {
  webview: {
    options: Record<string, unknown>;
    html: string;
    onDidReceiveMessage: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
    asWebviewUri: ReturnType<typeof vi.fn>;
    cspSource: string;
  };
  onDidDispose: ReturnType<typeof vi.fn>;
}

function createManifest(): PreviewManifest {
  return {
    manifestVersion: 1,
    assetId: 'asset-1',
    token: 'asset-1',
    kind: 'image',
    status: 'ready',
    sourceName: 'studio_360.jpg',
    sourceUrl: '/v1/preview/file/asset-1',
    projection: { type: 'equirectangular', confidence: 'trusted-filename', source: 'filename' },
    media: {
      dimensions: { width: 4096, height: 2048 },
      fileSizeBytes: 1024,
      mimeType: 'image/jpeg',
      dynamicRange: 'sdr',
      codec: { imageFormat: 'jpeg' },
    },
    variants: [],
    createdAt: '2026-05-07T00:00:00.000Z',
  };
}

function createPanel(): MockPanel {
  let messageHandler: ((message: Record<string, unknown>) => void | Promise<void>) | null = null;
  return {
    webview: {
      options: {},
      html: '',
      onDidReceiveMessage: vi.fn((handler) => {
        messageHandler = handler;
        return { dispose: vi.fn() };
      }),
      postMessage: vi.fn().mockResolvedValue(true),
      asWebviewUri: vi.fn(),
      cspSource: 'mock-csp',
    },
    onDidDispose: vi.fn((handler) => {
      return { dispose: handler };
    }),
    get messageHandler() {
      return messageHandler;
    },
  } as MockPanel & {
    readonly messageHandler: ((message: Record<string, unknown>) => void | Promise<void>) | null;
  };
}

function createStatusBar() {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    updatePlayback: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('PanoramicImagePreviewProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers image sources through engine manifest and sends no raw file path to Webview', async () => {
    const manifest = createManifest();
    const service = {
      isAvailable: true,
      getPreviewBaseUrl: vi.fn(() => 'http://127.0.0.1:3456'),
      registerPreviewAsset: vi.fn().mockResolvedValue(manifest),
      requestPreviewVariant: vi.fn(),
      updatePreviewAssetMetadata: vi.fn(),
      unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
    };
    const statusBar = createStatusBar();
    const provider = new PanoramicImagePreviewProvider(vscode.Uri.file('/ext'), statusBar as never);
    provider.setPreviewService(service as never);
    const panel = createPanel();
    const document = { uri: vscode.Uri.file('/project/studio_360.jpg'), dispose: vi.fn() };

    await provider.resolveCustomEditor(
      document as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );
    const readyHandler = (
      panel as unknown as { messageHandler: (message: Record<string, unknown>) => Promise<void> }
    ).messageHandler;
    await readyHandler({ type: 'ready' });

    expect(service.registerPreviewAsset).toHaveBeenCalledWith({
      source: '/project/studio_360.jpg',
      kind: 'image',
      explicitOpen: true,
    });
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'panorama:init',
      payload: {
        manifest,
        engineBaseUrl: 'http://127.0.0.1:3456',
      },
    });
    const payload = panel.webview.postMessage.mock.calls[0]?.[0]?.payload as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('filePath');
  });

  it('uses basename for Windows paths in the status bar', async () => {
    const manifest = createManifest();
    const service = {
      isAvailable: true,
      getPreviewBaseUrl: vi.fn(() => 'http://127.0.0.1:3456'),
      registerPreviewAsset: vi.fn().mockResolvedValue(manifest),
      requestPreviewVariant: vi.fn(),
      updatePreviewAssetMetadata: vi.fn(),
      unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
    };
    const statusBar = createStatusBar();
    const provider = new PanoramicImagePreviewProvider(vscode.Uri.file('/ext'), statusBar as never);
    provider.setPreviewService(service as never);

    await provider.resolveCustomEditor(
      {
        uri: vscode.Uri.file('C:\\project\\studio_360.jpg'),
        dispose: vi.fn(),
      } as vscode.CustomDocument,
      createPanel() as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );

    expect(statusBar.show).toHaveBeenCalledWith({ fileName: 'studio_360.jpg', duration: 0 });
  });

  it('cleans up the manifest asset on dispose', async () => {
    const manifest = createManifest();
    const disposeHandlers: Array<() => void> = [];
    const service = {
      isAvailable: true,
      getPreviewBaseUrl: vi.fn(() => 'http://127.0.0.1:3456'),
      registerPreviewAsset: vi.fn().mockResolvedValue(manifest),
      requestPreviewVariant: vi.fn(),
      updatePreviewAssetMetadata: vi.fn(),
      unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
    };
    const panel = createPanel();
    panel.onDidDispose.mockImplementation((handler) => {
      disposeHandlers.push(handler);
      return { dispose: vi.fn() };
    });
    const provider = new PanoramicImagePreviewProvider(
      vscode.Uri.file('/ext'),
      createStatusBar() as never,
    );
    provider.setPreviewService(service as never);

    await provider.resolveCustomEditor(
      {
        uri: vscode.Uri.file('/project/studio_360.jpg'),
        dispose: vi.fn(),
      } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );
    const readyHandler = (
      panel as unknown as { messageHandler: (message: Record<string, unknown>) => Promise<void> }
    ).messageHandler;
    await readyHandler({ type: 'ready' });
    disposeHandlers[0]?.();
    await Promise.resolve();

    expect(service.unregisterPreviewAsset).toHaveBeenCalledWith('asset-1');
  });

  it('renders an error state when manifest registration fails', async () => {
    vi.mocked(PreviewService.tryCreate).mockResolvedValueOnce(null);
    const provider = new PanoramicImagePreviewProvider(
      vscode.Uri.file('/ext'),
      createStatusBar() as never,
    );
    const panel = createPanel();

    await provider.resolveCustomEditor(
      {
        uri: vscode.Uri.file('/project/studio_360.jpg'),
        dispose: vi.fn(),
      } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );
    const readyHandler = (
      panel as unknown as { messageHandler: (message: Record<string, unknown>) => Promise<void> }
    ).messageHandler;
    await readyHandler({ type: 'ready' });

    expect(panel.webview.html).toContain('Panoramic Preview Error');
  });

  it('persists heuristic projection confirmation through engine metadata', async () => {
    const manifest = createManifest();
    const updatedManifest: PreviewManifest = {
      ...manifest,
      projection: { type: 'equirectangular', confidence: 'manual', source: 'manual' },
    };
    const service = {
      isAvailable: true,
      getPreviewBaseUrl: vi.fn(() => 'http://127.0.0.1:3456'),
      registerPreviewAsset: vi.fn().mockResolvedValue(manifest),
      requestPreviewVariant: vi.fn(),
      updatePreviewAssetMetadata: vi.fn().mockResolvedValue(updatedManifest),
      unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
    };
    const provider = new PanoramicImagePreviewProvider(
      vscode.Uri.file('/ext'),
      createStatusBar() as never,
    );
    provider.setPreviewService(service as never);
    const panel = createPanel();

    await provider.resolveCustomEditor(
      {
        uri: vscode.Uri.file('/project/studio_360.jpg'),
        dispose: vi.fn(),
      } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );
    const handler = (
      panel as unknown as {
        messageHandler: (message: Record<string, unknown>) => Promise<void>;
      }
    ).messageHandler;
    await handler({ type: 'ready' });
    await handler({
      type: 'panorama:confirmProjection',
      assetId: 'asset-1',
      projectionType: 'equirectangular',
    });

    expect(service.updatePreviewAssetMetadata).toHaveBeenCalledWith('asset-1', {
      projectionType: 'equirectangular',
    });
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'setContext',
      expect.stringContaining('panorama'),
      expect.anything(),
    );
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'panorama:init',
      payload: {
        manifest: updatedManifest,
        engineBaseUrl: 'http://127.0.0.1:3456',
      },
    });
  });

  it('persists default view through engine metadata', async () => {
    const manifest = createManifest();
    const viewState = {
      mode: 'sphere',
      yawDeg: 20,
      pitchDeg: 5,
      rollDeg: 0,
      fovDeg: 80,
      exposure: 1,
      toneMapping: 'aces',
    } as const;
    const updatedManifest: PreviewManifest = { ...manifest, defaultViewState: viewState };
    const service = {
      isAvailable: true,
      getPreviewBaseUrl: vi.fn(() => 'http://127.0.0.1:3456'),
      registerPreviewAsset: vi.fn().mockResolvedValue(manifest),
      requestPreviewVariant: vi.fn(),
      updatePreviewAssetMetadata: vi.fn().mockResolvedValue(updatedManifest),
      unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
    };
    const provider = new PanoramicImagePreviewProvider(
      vscode.Uri.file('/ext'),
      createStatusBar() as never,
    );
    provider.setPreviewService(service as never);
    const panel = createPanel();

    await provider.resolveCustomEditor(
      {
        uri: vscode.Uri.file('/project/studio_360.jpg'),
        dispose: vi.fn(),
      } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );
    const handler = (
      panel as unknown as {
        messageHandler: (message: Record<string, unknown>) => Promise<void>;
      }
    ).messageHandler;
    await handler({ type: 'ready' });
    await handler({ type: 'panorama:saveDefaultView', assetId: 'asset-1', viewState });

    expect(service.updatePreviewAssetMetadata).toHaveBeenCalledWith('asset-1', {
      defaultViewState: viewState,
    });
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'panorama:init',
      payload: {
        manifest: updatedManifest,
        engineBaseUrl: 'http://127.0.0.1:3456',
      },
    });
  });

  it('persists projection, coverage, and default view atomically through updateAsset', async () => {
    const manifest = createManifest();
    const viewState = {
      mode: 'little-planet',
      yawDeg: 20,
      pitchDeg: 5,
      rollDeg: 0,
      fovDeg: 80,
      exposure: 1,
      toneMapping: 'aces',
    } as const;
    const normalizedViewState = { ...viewState, mode: 'cylindrical' as const };
    const updatedManifest: PreviewManifest = {
      ...manifest,
      projection: {
        type: 'cylindrical',
        confidence: 'manual',
        source: 'manual',
        coverageAngle: { horizontalDeg: 220, verticalDeg: 70 },
      },
      defaultViewState: normalizedViewState,
    };
    const service = {
      isAvailable: true,
      getPreviewBaseUrl: vi.fn(() => 'http://127.0.0.1:3456'),
      registerPreviewAsset: vi.fn().mockResolvedValue(manifest),
      requestPreviewVariant: vi.fn(),
      updatePreviewAssetMetadata: vi.fn().mockResolvedValue(updatedManifest),
      unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
    };
    const provider = new PanoramicImagePreviewProvider(
      vscode.Uri.file('/ext'),
      createStatusBar() as never,
    );
    provider.setPreviewService(service as never);
    const panel = createPanel();

    await provider.resolveCustomEditor(
      {
        uri: vscode.Uri.file('/project/studio_360.jpg'),
        dispose: vi.fn(),
      } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );
    const handler = (
      panel as unknown as {
        messageHandler: (message: Record<string, unknown>) => Promise<void>;
      }
    ).messageHandler;
    await handler({ type: 'ready' });
    await handler({
      type: 'panorama:updateAsset',
      assetId: 'asset-1',
      projectionType: 'cylindrical',
      coverageAngle: { horizontalDeg: 220, verticalDeg: 70 },
      defaultViewState: viewState,
    });

    expect(service.updatePreviewAssetMetadata).toHaveBeenCalledWith('asset-1', {
      projectionType: 'cylindrical',
      coverageAngle: { horizontalDeg: 220, verticalDeg: 70 },
      defaultViewState: normalizedViewState,
    });
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'panorama:init',
      payload: {
        manifest: updatedManifest,
        engineBaseUrl: 'http://127.0.0.1:3456',
      },
    });
  });

  it('requests FOV crop variants with semantic view state', async () => {
    const manifest = createManifest();
    const variant = {
      id: 'variant-1',
      assetId: 'asset-1',
      role: 'fov-crop',
      url: '/v1/preview/file/asset-1',
    };
    const service = {
      isAvailable: true,
      getPreviewBaseUrl: vi.fn(() => 'http://127.0.0.1:3456'),
      registerPreviewAsset: vi.fn().mockResolvedValue(manifest),
      requestPreviewVariant: vi.fn().mockResolvedValue(variant),
      updatePreviewAssetMetadata: vi.fn(),
      unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
    };
    const provider = new PanoramicImagePreviewProvider(
      vscode.Uri.file('/ext'),
      createStatusBar() as never,
    );
    provider.setPreviewService(service as never);
    const panel = createPanel();

    await provider.resolveCustomEditor(
      {
        uri: vscode.Uri.file('/project/studio_360.jpg'),
        dispose: vi.fn(),
      } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );
    const handler = (
      panel as unknown as {
        messageHandler: (message: Record<string, unknown>) => Promise<void>;
      }
    ).messageHandler;
    await handler({ type: 'ready' });
    await handler({
      type: 'panorama:requestVariant',
      assetId: 'asset-1',
      request: {
        role: 'fov-crop',
        width: 512,
        height: 512,
        viewState: {
          mode: 'sphere',
          yawDeg: 90,
          pitchDeg: 0,
          rollDeg: 0,
          fovDeg: 75,
          exposure: 0,
          toneMapping: 'aces',
        },
      },
    });

    expect(service.requestPreviewVariant).toHaveBeenCalledWith(
      'asset-1',
      expect.objectContaining({ role: 'fov-crop', width: 512, height: 512 }),
    );
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'panorama:variantReady',
      payload: { variant },
    });
  });

  it('passes projection and coverage overrides on variant requests', async () => {
    const manifest = createManifest();
    const variant = {
      id: 'variant-1',
      assetId: 'asset-1',
      role: 'fov-crop',
      url: '/v1/preview/file/asset-1',
    };
    const service = {
      isAvailable: true,
      getPreviewBaseUrl: vi.fn(() => 'http://127.0.0.1:3456'),
      registerPreviewAsset: vi.fn().mockResolvedValue(manifest),
      requestPreviewVariant: vi.fn().mockResolvedValue(variant),
      updatePreviewAssetMetadata: vi.fn(),
      unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
    };
    const provider = new PanoramicImagePreviewProvider(
      vscode.Uri.file('/ext'),
      createStatusBar() as never,
    );
    provider.setPreviewService(service as never);
    const panel = createPanel();

    await provider.resolveCustomEditor(
      {
        uri: vscode.Uri.file('/project/studio_360.jpg'),
        dispose: vi.fn(),
      } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );
    const handler = (
      panel as unknown as {
        messageHandler: (message: Record<string, unknown>) => Promise<void>;
      }
    ).messageHandler;
    await handler({ type: 'ready' });
    await handler({
      type: 'panorama:requestVariant',
      assetId: 'asset-1',
      request: {
        role: 'fov-crop',
        width: 512,
        height: 512,
        projectionType: 'cylindrical',
        coverageAngle: { horizontalDeg: 720, verticalDeg: 65 },
        viewState: {
          mode: 'little-planet',
          yawDeg: 90,
          pitchDeg: 0,
          rollDeg: 0,
          fovDeg: 75,
          exposure: 0,
          toneMapping: 'aces',
        },
      },
    });

    expect(service.requestPreviewVariant).toHaveBeenCalledWith('asset-1', {
      role: 'fov-crop',
      width: 512,
      height: 512,
      projectionType: 'cylindrical',
      coverageAngle: { horizontalDeg: 360, verticalDeg: 65 },
      viewState: {
        mode: 'cylindrical',
        yawDeg: 90,
        pitchDeg: 0,
        rollDeg: 0,
        fovDeg: 75,
        exposure: 0,
        toneMapping: 'aces',
      },
    });
  });

  it('sends EnvironmentPlacement to model without mapping preview yaw to rotation', async () => {
    const manifest = createManifest();
    const service = {
      isAvailable: true,
      getPreviewBaseUrl: vi.fn(() => 'http://127.0.0.1:3456'),
      registerPreviewAsset: vi.fn().mockResolvedValue(manifest),
      requestPreviewVariant: vi.fn(),
      updatePreviewAssetMetadata: vi.fn(),
      unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
    };
    const provider = new PanoramicImagePreviewProvider(
      vscode.Uri.file('/ext'),
      createStatusBar() as never,
    );
    provider.setPreviewService(service as never);
    const panel = createPanel();

    await provider.resolveCustomEditor(
      {
        uri: vscode.Uri.file('/project/studio_360.jpg'),
        dispose: vi.fn(),
      } as vscode.CustomDocument,
      panel as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );
    const handler = (
      panel as unknown as {
        messageHandler: (message: Record<string, unknown>) => Promise<void>;
      }
    ).messageHandler;
    await handler({ type: 'ready' });
    await handler({
      type: 'panorama:sendToModel',
      assetId: 'asset-1',
      viewState: {
        mode: 'sphere',
        yawDeg: 135,
        pitchDeg: 20,
        rollDeg: 0,
        fovDeg: 75,
        exposure: 1,
        toneMapping: 'aces',
      },
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'neko.model.useEnvironment',
      expect.objectContaining({
        sourceAssetId: 'asset-1',
        rotationDeg: 0,
        exposure: 1,
      }),
    );
  });

  it('uses the panoramic image Webview entry', async () => {
    const service = {
      isAvailable: true,
      getPreviewBaseUrl: vi.fn(() => 'http://127.0.0.1:3456'),
      registerPreviewAsset: vi.fn().mockResolvedValue(createManifest()),
      requestPreviewVariant: vi.fn(),
      updatePreviewAssetMetadata: vi.fn(),
      unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
    };
    const provider = new PanoramicImagePreviewProvider(
      vscode.Uri.file('/ext'),
      createStatusBar() as never,
    );
    provider.setPreviewService(service as never);

    await provider.resolveCustomEditor(
      {
        uri: vscode.Uri.file('/project/studio_360.jpg'),
        dispose: vi.fn(),
      } as vscode.CustomDocument,
      createPanel() as unknown as vscode.WebviewPanel,
      {} as vscode.CancellationToken,
    );

    expect(getWebviewHtml).toHaveBeenCalledWith(
      expect.objectContaining({ entry: 'panorama-image' }),
    );
  });
});
