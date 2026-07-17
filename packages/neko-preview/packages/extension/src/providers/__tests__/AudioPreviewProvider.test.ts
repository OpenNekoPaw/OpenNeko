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
  getWebviewHtml: vi.fn(() => '<html>mock audio webview</html>'),
}));

vi.mock('../../services/PreviewService', () => ({
  PreviewService: {
    tryCreate: vi.fn(),
  },
}));

import { AudioPreviewProvider } from '../../providers/AudioPreviewProvider';
import { PreviewService, type MediaInfo } from '../../services/PreviewService';
import * as vscode from 'vscode';
import { getWebviewHtml } from '../../utils/html';

// ============================================================================
// Helpers
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

function createMockWebviewPanel() {
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

function createMockPreviewService(overrides: Record<string, unknown> = {}): PreviewService {
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
    getAudioWebSocketUrl: vi.fn((id: string) => `ws://127.0.0.1:8080/v1/audio/${id}`),
    getWaveform: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as PreviewService;
}

const mockAudioInfo: MediaInfo = {
  duration: 240,
  width: 0,
  height: 0,
  fps: 0,
  codec: '',
  format: 'mp3',
  hasAudio: true,
  audioCodec: 'mp3',
  audioSampleRate: 44100,
  audioChannels: 2,
};

// ============================================================================
// Tests
// ============================================================================

describe('AudioPreviewProvider', () => {
  let provider: AudioPreviewProvider;
  let statusBar: MockStatusBar;
  let extensionUri: vscode.Uri;

  beforeEach(() => {
    vi.clearAllMocks();
    statusBar = createMockStatusBar();
    extensionUri = vscode.Uri.file('/ext');
    provider = new AudioPreviewProvider(
      extensionUri,
      statusBar as unknown as import('../../ui/StatusBarManager').StatusBarManager,
    );
  });

  describe('static viewType', () => {
    it('should have correct view type identifier', () => {
      expect(AudioPreviewProvider.viewType).toBe('neko.audioPreview');
    });
  });

  describe('openCustomDocument()', () => {
    it('should return a custom document with the provided URI', async () => {
      const uri = vscode.Uri.file('/path/to/song.mp3');
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
      (mockService.probeMedia as ReturnType<typeof vi.fn>).mockResolvedValue(mockAudioInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/song.mp3');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      expect(panel.webview.options).toEqual(expect.objectContaining({ enableScripts: true }));
    });

    it('should use audio entry for webview HTML', async () => {
      const mockService = createMockPreviewService();
      (mockService.probeMedia as ReturnType<typeof vi.fn>).mockResolvedValue(mockAudioInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/song.mp3');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      expect(getWebviewHtml).toHaveBeenCalledWith(expect.objectContaining({ entry: 'audio' }));
    });

    it('should show error HTML when service is unavailable', async () => {
      const mockService = createMockPreviewService({ isAvailable: false });
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/song.mp3');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      // Trigger ready message to exercise the path
      const messageHandler = panel.webview.onDidReceiveMessage.mock.calls[0]?.[0] as
        ((msg: Record<string, unknown>) => Promise<void>) | undefined;
      if (messageHandler) {
        await messageHandler({ type: 'ready' });
      }
      await new Promise((r) => setTimeout(r, 0));

      expect(panel.webview.html).toContain('Failed to initialize media engine');
    });

    it('should show error HTML when probe fails', async () => {
      const mockService = createMockPreviewService();
      (mockService.probeMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Bad audio format'),
      );
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/bad.wav');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      await new Promise((r) => setTimeout(r, 0));

      expect(panel.webview.html).toContain('Failed to probe audio file');
      expect(panel.webview.html).toContain('Bad audio format');
    });

    it('should update status bar with audio-specific info after probe', async () => {
      const mockService = createMockPreviewService();
      (mockService.probeMedia as ReturnType<typeof vi.fn>).mockResolvedValue(mockAudioInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/song.mp3');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      // Wait for probe to complete
      await new Promise((r) => setTimeout(r, 0));

      // Second call to show() should include audio info
      expect(statusBar.show).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'song.mp3',
          audioCodec: 'mp3',
          audioSampleRate: 44100,
          audioChannels: 2,
          duration: 240,
        }),
      );
    });
  });

  describe('message handling', () => {
    async function setupWithMessageHandler() {
      const mockService = createMockPreviewService();
      (mockService.probeMedia as ReturnType<typeof vi.fn>).mockResolvedValue(mockAudioInfo);
      (mockService.getWaveform as ReturnType<typeof vi.fn>).mockResolvedValue({
        peaks: [0.1, 0.5, 0.3],
        duration: 240,
        sampleRate: 44100,
      });
      (mockService.startVideoPlayback as ReturnType<typeof vi.fn>).mockResolvedValue({
        videoStreamId: null,
        audioStreamId: 'audio-stream-1',
      });
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/song.mp3');

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

    it('should handle "ready" by sending init and waveform data', async () => {
      const { panel, messageHandler } = await setupWithMessageHandler();

      await messageHandler({ type: 'ready' });

      expect(panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'preview:init',
          payload: expect.objectContaining({
            filePath: '/path/to/song.mp3',
            mediaInfo: mockAudioInfo,
          }),
        }),
      );
      expect(panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'preview:waveform',
        }),
      );
    });

    it('should handle "preview:play" by starting playback via startVideoPlayback', async () => {
      const { mockService, panel, messageHandler } = await setupWithMessageHandler();

      await messageHandler({ type: 'preview:play' });

      expect(mockService.startVideoPlayback).toHaveBeenCalledWith(
        '/path/to/song.mp3',
        mockAudioInfo,
        0,
      );
      expect(panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'preview:streamReady',
          payload: expect.objectContaining({
            audioStreamId: 'audio-stream-1',
            audioStreamUrl: 'ws://127.0.0.1:8080/v1/audio/audio-stream-1',
          }),
        }),
      );
    });

    it('should handle "preview:pause" message', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      // Start playback to set active stream ID
      await messageHandler({ type: 'preview:play' });

      await messageHandler({ type: 'preview:pause' });

      expect(mockService.pauseStreams).toHaveBeenCalledWith(null, 'audio-stream-1');
    });

    it('should handle "preview:resume" message', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      await messageHandler({ type: 'preview:play' });
      await messageHandler({ type: 'preview:resume' });

      expect(mockService.resumeStreams).toHaveBeenCalledWith(null, 'audio-stream-1');
    });

    it('should handle "preview:stop" message', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      await messageHandler({ type: 'preview:play' });
      await messageHandler({ type: 'preview:stop' });

      expect(mockService.stopStreams).toHaveBeenCalledWith(null, 'audio-stream-1');
    });

    it('should handle "preview:seek" message with valid time', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      await messageHandler({ type: 'preview:play' });
      await messageHandler({ type: 'preview:seek', time: 60.0 });

      expect(mockService.seekStreams).toHaveBeenCalledWith(null, 'audio-stream-1', 60.0);
    });

    it('should handle "preview:speed" message', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      await messageHandler({ type: 'preview:play' });
      await messageHandler({ type: 'preview:speed', speed: 0.5 });

      expect(mockService.setStreamSpeed).toHaveBeenCalledWith(null, 'audio-stream-1', 0.5);
    });

    it('should handle "preview:statusUpdate" message', async () => {
      const { messageHandler } = await setupWithMessageHandler();

      await messageHandler({
        type: 'preview:statusUpdate',
        playbackState: 'paused',
        currentTime: 30.0,
      });

      expect(statusBar.updatePlayback).toHaveBeenCalledWith('paused', 30.0);
    });

    it('should resume existing stream on second play', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      // First play — creates stream
      await messageHandler({ type: 'preview:play' });

      // Second play — should resume existing stream (not stop + restart)
      await messageHandler({ type: 'preview:play' });

      expect(mockService.resumeStreams).toHaveBeenCalledWith(null, 'audio-stream-1');
    });

    it('should pass startTime to startVideoPlayback when provided in play message', async () => {
      const { mockService, messageHandler } = await setupWithMessageHandler();

      await messageHandler({ type: 'preview:play', startTime: 45 });

      expect(mockService.startVideoPlayback).toHaveBeenCalledWith(
        '/path/to/song.mp3',
        mockAudioInfo,
        45,
      );
    });
  });

  describe('panel dispose', () => {
    it('should clean up on panel dispose', async () => {
      const mockService = createMockPreviewService();
      (mockService.probeMedia as ReturnType<typeof vi.fn>).mockResolvedValue(mockAudioInfo);
      (mockService.startVideoPlayback as ReturnType<typeof vi.fn>).mockResolvedValue({
        videoStreamId: null,
        audioStreamId: 'audio-1',
      });
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/song.mp3');

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

      // Dispose panel
      const disposeHandler = panel.onDidDispose.mock.calls[0]?.[0] as () => Promise<void>;
      await disposeHandler();

      expect(statusBar.hide).toHaveBeenCalled();
      expect(mockService.stopStreams).toHaveBeenCalledWith(null, 'audio-1');
    });
  });

  describe('visibility changes', () => {
    it('should hide status bar when panel becomes hidden', async () => {
      const mockService = createMockPreviewService();
      (mockService.probeMedia as ReturnType<typeof vi.fn>).mockResolvedValue(mockAudioInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/song.mp3');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      panel.visible = false;
      const visibilityHandler = panel.onDidChangeViewState.mock
        .calls[0]?.[0] as () => Promise<void>;
      await visibilityHandler();

      expect(statusBar.hide).toHaveBeenCalled();
    });

    it('should restore status bar when panel becomes visible again', async () => {
      const mockService = createMockPreviewService();
      (mockService.probeMedia as ReturnType<typeof vi.fn>).mockResolvedValue(mockAudioInfo);
      provider.setPreviewService(mockService);

      const panel = createMockWebviewPanel();
      const document = createMockDocument('/path/to/song.mp3');

      await provider.resolveCustomEditor(
        document,
        panel as unknown as vscode.WebviewPanel,
        {} as vscode.CancellationToken,
      );

      await new Promise((r) => setTimeout(r, 0));

      // Hide then show
      panel.visible = false;
      const visibilityHandler = panel.onDidChangeViewState.mock
        .calls[0]?.[0] as () => Promise<void>;
      await visibilityHandler();

      statusBar.show.mockClear();
      panel.visible = true;
      await visibilityHandler();

      expect(statusBar.show).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'song.mp3',
          audioCodec: 'mp3',
          duration: 240,
        }),
      );
    });
  });

  describe('dispose()', () => {
    it('should not throw when disposing provider', () => {
      provider.dispose();
    });
  });
});
