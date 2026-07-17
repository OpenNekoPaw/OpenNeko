import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock vscode module
// ============================================================================

vi.mock('vscode', () => {
  const Uri = {
    file: (path: string) => ({
      scheme: 'file',
      fsPath: path,
      path,
      toString: () => path,
    }),
    parse: (str: string) => ({
      scheme: 'file',
      fsPath: str,
      path: str,
      toString: () => str,
    }),
    joinPath: (base: { path: string }, ...segments: string[]) => {
      const joined = [base.path, ...segments].join('/');
      return {
        scheme: 'file',
        fsPath: joined,
        path: joined,
        toString: () => joined,
      };
    },
  };

  return {
    Uri,
    commands: {
      executeCommand: vi.fn(),
    },
    extensions: {
      getExtension: vi.fn(),
    },
  };
});

// ============================================================================
// Mock dependencies
// ============================================================================

vi.mock('../../utils/html', () => ({
  getWebviewHtml: vi.fn(() => '<html>mock webview</html>'),
}));

vi.mock('../../services/PreviewService', () => ({
  PreviewService: {
    tryCreate: vi.fn(),
  },
}));

import { VideoPreviewProvider } from '../../providers/VideoPreviewProvider';
import { PreviewService, type MediaInfo } from '../../services/PreviewService';
import * as vscode from 'vscode';
import { getWebviewHtml } from '../../utils/html';

// ============================================================================
// Helpers: mock factories
// ============================================================================

interface MockStatusBar {
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  updatePlayback: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

function createMockStatusBar(): MockStatusBar {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    updatePlayback: vi.fn(),
    dispose: vi.fn(),
  };
}

interface MockWebviewPanel {
  webview: {
    options: Record<string, unknown>;
    html: string;
    onDidReceiveMessage: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
    asWebviewUri: ReturnType<typeof vi.fn>;
    cspSource: string;
  };
  onDidChangeViewState: ReturnType<typeof vi.fn>;
  onDidDispose: ReturnType<typeof vi.fn>;
  visible: boolean;
}

function createMockWebviewPanel(): MockWebviewPanel {
  return {
    webview: {
      options: {},
      html: '',
      onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
      postMessage: vi.fn().mockResolvedValue(true),
      asWebviewUri: vi.fn((uri: { path: string }) => `webview-uri:${uri.path}`),
      cspSource: 'https://mock.csp',
    },
    onDidChangeViewState: vi.fn(() => ({ dispose: vi.fn() })),
    onDidDispose: vi.fn(),
    visible: true,
  };
}

function createMockDocument(filePath: string): vscode.CustomDocument {
  return {
    uri: vscode.Uri.file(filePath),
    dispose: vi.fn(),
  };
}

function createMockPreviewService(
  overrides: Partial<{
    isAvailable: boolean;
    port: number | null;
    probeMedia: ReturnType<typeof vi.fn>;
    startVideoPlayback: ReturnType<typeof vi.fn>;
    stopStreams: ReturnType<typeof vi.fn>;
    pauseStreams: ReturnType<typeof vi.fn>;
    resumeStreams: ReturnType<typeof vi.fn>;
    seekStreams: ReturnType<typeof vi.fn>;
    setStreamSpeed: ReturnType<typeof vi.fn>;
    captureFrame: ReturnType<typeof vi.fn>;
    getStreamWebSocketUrl: ReturnType<typeof vi.fn>;
    dispatch: ReturnType<typeof vi.fn>;
  }> = {},
): PreviewService {
  return {
    isAvailable: true,
    port: 8080,
    probeMedia: vi.fn(),
    startVideoPlayback: vi.fn(),
    stopStreams: vi.fn(),
    pauseStreams: vi.fn(),
    resumeStreams: vi.fn(),
    seekStreams: vi.fn(),
    setStreamSpeed: vi.fn(),
    captureFrame: vi.fn(),
    getStreamWebSocketUrl: vi.fn((id: string) => `ws://127.0.0.1:8080/v1/streams/${id}`),
    dispatch: vi.fn(),
    dispose: vi.fn(),
    getWaveform: vi.fn(),
    ...overrides,
  } as unknown as PreviewService;
}

const mockMediaInfo: MediaInfo = {
  duration: 120,
  width: 1920,
  height: 1080,
  fps: 30,
  codec: 'h264',
  format: 'mp4',
  hasAudio: true,
  audioCodec: 'aac',
  audioSampleRate: 44100,
  audioChannels: 2,
};

// ============================================================================
// Tests
// ============================================================================

describe('VideoPreviewProvider', () => {
  let provider: VideoPreviewProvider;
  let statusBar: MockStatusBar;
  let extensionUri: vscode.Uri;

  beforeEach(() => {
    vi.clearAllMocks();
    statusBar = createMockStatusBar();
    extensionUri = vscode.Uri.file('/ext');
    provider = new VideoPreviewProvider(
      extensionUri,
      statusBar as unknown as import('../../ui/StatusBarManager').StatusBarManager,
    );
  });

  describe('static viewType', () => {
    it('should have correct view type identifier', () => {
      expect(VideoPreviewProvider.viewType).toBe('neko.videoPreview');
    });
  });

  describe('openCustomDocument()', () => {
    it('should return a custom document with the provided URI', async () => {
      const uri = vscode.Uri.file('/path/to/video.mp4');
      const doc = await provider.openCustomDocument(
        uri,
        {} as vscode.CustomDocumentOpenContext,
        {} as vscode.CancellationToken,
      );

      expect(doc.uri).toBe(uri);
      expect(typeof doc.dispose).toBe('function');
    });
  });

  describe('resolveCustomEditor()', () => {
    it('should configure webview with scripts enabled', async () => {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockResolvedValue(mockMediaInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      expect(panel.webview.options).toEqual(expect.objectContaining({ enableScripts: true }));
    });

    it('should pin the editor tab', async () => {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockResolvedValue(mockMediaInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.pinEditor');
    });

    it('should show status bar with file name immediately', async () => {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockResolvedValue(mockMediaInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      expect(statusBar.show).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'video.mp4',
          duration: 0,
        }),
      );
    });

    it('should set webview HTML using getWebviewHtml with video entry', async () => {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockResolvedValue(mockMediaInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      expect(getWebviewHtml).toHaveBeenCalledWith(expect.objectContaining({ entry: 'video' }));
    });

    it('should register message handler on webview', async () => {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockResolvedValue(mockMediaInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      expect(panel.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it('should register onDidChangeViewState listener', async () => {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockResolvedValue(mockMediaInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      expect(panel.onDidChangeViewState).toHaveBeenCalled();
    });

    it('should register onDidDispose listener', async () => {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockResolvedValue(mockMediaInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      expect(panel.onDidDispose).toHaveBeenCalled();
    });

    it('should show error HTML when preview service is unavailable', async () => {
      const mockService = createMockPreviewService({ isAvailable: false });
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      // Trigger the ready message to exercise the mediaInfoPromise path
      const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0]?.[0] as
        ((msg: Record<string, unknown>) => Promise<void>) | undefined;
      if (messageHandler) {
        await messageHandler({ type: 'ready' });
      }

      // The webview HTML should eventually be set to the error HTML
      // (happens asynchronously in the IIFE)
      // Give the IIFE a tick to run
      await new Promise((r) => setTimeout(r, 0));

      expect(panel.webview.html).toContain('Failed to initialize media engine');
      expect(statusBar.hide).toHaveBeenCalled();
    });

    it('should show error HTML when probe fails', async () => {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockRejectedValue(new Error('Corrupt file'));
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/corrupt.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      // Wait for the async probe to settle
      await new Promise((r) => setTimeout(r, 0));

      expect(panel.webview.html).toContain('Failed to probe media file');
      expect(panel.webview.html).toContain('Corrupt file');
    });
  });

  describe('message handling', () => {
    async function setupWithMessageHandler() {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockResolvedValue(mockMediaInfo);
      mockService.startVideoPlayback = vi.fn().mockResolvedValue({
        videoStreamId: 'vid-1',
        audioStreamId: 'aud-1',
      });
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0]?.[0] as (
        msg: Record<string, unknown>,
      ) => Promise<void>;

      return { mockService, panel, messageHandler };
    }

    it('should handle "ready" message by sending init with media info', async () => {
      const { panel, messageHandler } = await setupWithMessageHandler();

      await messageHandler({ type: 'ready' });

      expect(panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'preview:init',
          payload: expect.objectContaining({
            filePath: '/path/to/video.mp4',
            mediaInfo: mockMediaInfo,
          }),
        }),
      );
    });

    it('should handle "preview:play" message by starting playback', async () => {
      const { mockService, panel, messageHandler } = await setupWithMessageHandler();

      await messageHandler({ type: 'preview:play', startTime: 10, speed: 1.5 });

      expect(mockService.startVideoPlayback).toHaveBeenCalledWith(
        '/path/to/video.mp4',
        mockMediaInfo,
        10,
        1.5,
      );
      expect(panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'preview:streamReady' }),
      );
    });

    it('should handle "preview:pause" message', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      // First start playback to set active stream IDs
      await messageHandler({ type: 'preview:play' });

      await messageHandler({ type: 'preview:pause' });

      expect(mockService.pauseStreams).toHaveBeenCalledWith('vid-1', 'aud-1');
    });

    it('should handle "preview:resume" message', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      await messageHandler({ type: 'preview:play' });
      await messageHandler({ type: 'preview:resume' });

      expect(mockService.resumeStreams).toHaveBeenCalledWith('vid-1', 'aud-1');
    });

    it('should handle "preview:stop" message by stopping streams', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      // Start playback to set active stream IDs
      await messageHandler({ type: 'preview:play' });

      await messageHandler({ type: 'preview:stop' });

      expect(mockService.stopStreams).toHaveBeenCalledWith('vid-1', 'aud-1');
    });

    it('should handle "preview:seek" message with valid time', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      await messageHandler({ type: 'preview:play' });
      await messageHandler({ type: 'preview:seek', time: 42.5 });

      expect(mockService.seekStreams).toHaveBeenCalledWith('vid-1', 'aud-1', 42.5);
    });

    it('should handle "preview:speed" message', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      await messageHandler({ type: 'preview:play' });
      await messageHandler({ type: 'preview:speed', speed: 2.0 });

      expect(mockService.setStreamSpeed).toHaveBeenCalledWith('vid-1', 'aud-1', 2.0);
    });

    it('should handle "preview:captureFrame" message', async () => {
      const { mockService, panel, messageHandler } = await setupWithMessageHandler();

      mockService.captureFrame = vi.fn().mockResolvedValue('data:image/jpeg;base64,base64data');

      await messageHandler({ type: 'preview:captureFrame', time: 5.0 });

      expect(mockService.captureFrame).toHaveBeenCalledWith('/path/to/video.mp4', 5.0);
      expect(panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'preview:frameData',
          payload: {
            imageDataUrl: 'data:image/jpeg;base64,base64data',
          },
        }),
      );
    });

    it('should handle "preview:statusUpdate" message', async () => {
      const { messageHandler } = await setupWithMessageHandler();

      await messageHandler({
        type: 'preview:statusUpdate',
        playbackState: 'playing',
        currentTime: 15.5,
      });

      expect(statusBar.updatePlayback).toHaveBeenCalledWith('playing', 15.5);
    });

    it('should resume existing streams on second play', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      // First play — creates streams
      await messageHandler({ type: 'preview:play' });

      // Second play — should resume existing streams (not stop + restart)
      await messageHandler({ type: 'preview:play' });

      expect(mockService.resumeStreams).toHaveBeenCalledWith('vid-1', 'aud-1');
    });

    it('should ignore unknown message types', async () => {
      const { messageHandler } = await setupWithMessageHandler();

      // Should not throw
      await messageHandler({ type: 'unknown:message' });
    });
  });

  describe('panel dispose', () => {
    it('should hide status bar and stop streams on dispose', async () => {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockResolvedValue(mockMediaInfo);
      mockService.startVideoPlayback = vi.fn().mockResolvedValue({
        videoStreamId: 'vid-1',
        audioStreamId: 'aud-1',
      });
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      // Start playback
      const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0]?.[0] as (
        msg: Record<string, unknown>,
      ) => Promise<void>;
      await messageHandler({ type: 'preview:play' });

      // Trigger dispose
      const disposeHandler = panel.onDidDispose.mock.calls[0]?.[0] as () => Promise<void>;
      await disposeHandler();

      expect(statusBar.hide).toHaveBeenCalled();
      expect(mockService.stopStreams).toHaveBeenCalledWith('vid-1', 'aud-1');
    });
  });

  describe('visibility changes', () => {
    it('should hide status bar when panel becomes invisible', async () => {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockResolvedValue(mockMediaInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      // Trigger visibility change
      panel.visible = false;
      const visibilityHandler = panel.onDidChangeViewState.mock
        .calls[0]?.[0] as () => Promise<void>;
      await visibilityHandler();

      expect(statusBar.hide).toHaveBeenCalled();
    });

    it('should show status bar with media info when panel becomes visible again', async () => {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockResolvedValue(mockMediaInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      // Wait for probe to complete
      await new Promise((r) => setTimeout(r, 0));

      // Become invisible then visible again
      panel.visible = false;
      const visibilityHandler = panel.onDidChangeViewState.mock
        .calls[0]?.[0] as () => Promise<void>;
      await visibilityHandler();

      statusBar.show.mockClear();
      panel.visible = true;
      await visibilityHandler();

      expect(statusBar.show).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'video.mp4',
          codec: 'h264',
          width: 1920,
          height: 1080,
        }),
      );
    });
  });

  describe('setPreviewService()', () => {
    it('should accept and use injected service', async () => {
      const mockService = createMockPreviewService();
      mockService.probeMedia = vi.fn().mockResolvedValue(mockMediaInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/video.mp4');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      // Wait for probe
      await new Promise((r) => setTimeout(r, 0));

      expect(mockService.probeMedia).toHaveBeenCalledWith('/path/to/video.mp4');
    });
  });

  describe('dispose()', () => {
    it('should dispose all internal disposables', () => {
      // Just verify it does not throw
      provider.dispose();
    });
  });
});
