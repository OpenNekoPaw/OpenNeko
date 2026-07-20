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
    joinPath: (base: { path: string }, ...segments: string[]) => {
      const joined = [base.path, ...segments].join('/');
      return { scheme: 'file', fsPath: joined, path: joined, toString: () => joined };
    },
  };

  class MockEventEmitter {
    private listeners: Array<(...args: unknown[]) => void> = [];
    event = (listener: (...args: unknown[]) => void) => {
      this.listeners.push(listener);
      return { dispose: vi.fn() };
    };
    fire = (...args: unknown[]) => {
      for (const l of this.listeners) l(...args);
    };
    dispose = vi.fn();
  }

  return {
    Uri,
    EventEmitter: MockEventEmitter,
    l10n: { t: vi.fn((key: string) => key) },
    window: {
      registerCustomEditorProvider: vi.fn(() => ({ dispose: vi.fn() })),
      showOpenDialog: vi.fn(),
      showQuickPick: vi.fn(),
      showWarningMessage: vi.fn(),
      createStatusBarItem: vi.fn(() => ({
        text: '',
        tooltip: '',
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
      })),
      createTreeView: vi.fn(() => ({
        visible: false,
        reveal: vi.fn(),
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
      })),
      onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
      createOutputChannel: vi.fn(() => ({
        append: vi.fn(),
        appendLine: vi.fn(),
        clear: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
      })),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn((_key: string, fallback: unknown) => fallback),
        inspect: vi.fn(() => ({})),
      })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    },
    commands: {
      registerCommand: vi.fn((_id: string, handler: (...args: unknown[]) => unknown) => {
        return { dispose: vi.fn(), handler };
      }),
      executeCommand: vi.fn(),
    },
    languages: {
      registerDocumentSymbolProvider: vi.fn(() => ({ dispose: vi.fn() })),
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
  };
});

// ============================================================================
// Mock internal modules
// ============================================================================

const mockPreviewService = {
  isAvailable: true,
  port: 9090,
  probeMedia: vi.fn(),
  startVideoPlayback: vi.fn(),
  stopStreams: vi.fn(),
  pauseStreams: vi.fn(),
  resumeStreams: vi.fn(),
  seekStreams: vi.fn(),
  setStreamSpeed: vi.fn(),
  captureFrame: vi.fn(),
  registerPreviewAsset: vi.fn(),
  requestPreviewVariant: vi.fn(),
  updatePreviewAssetMetadata: vi.fn(),
  unregisterPreviewAsset: vi.fn(),
  getStreamWebSocketUrl: vi.fn((id: string) => `ws://127.0.0.1:9090/v1/streams/${id}`),
  dispose: vi.fn(),
};

vi.mock('../services/PreviewService', () => ({
  PreviewService: {
    tryCreate: vi.fn(() => Promise.resolve(mockPreviewService)),
  },
}));

vi.mock('../providers/VideoPreviewProvider', () => {
  const ctor = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setPreviewService = vi.fn();
    this.dispose = vi.fn();
  });
  (ctor as unknown as Record<string, string>).viewType = 'neko.videoPreview';
  return { VideoPreviewProvider: ctor };
});

vi.mock('../providers/AudioPreviewProvider', () => {
  const ctor = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setPreviewService = vi.fn();
    this.dispose = vi.fn();
  });
  (ctor as unknown as Record<string, string>).viewType = 'neko.audioPreview';
  return { AudioPreviewProvider: ctor };
});

vi.mock('../providers/PanoramicImagePreviewProvider', () => {
  const ctor = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setPreviewService = vi.fn();
    this.dispose = vi.fn();
  });
  (ctor as unknown as Record<string, string>).viewType = 'neko.preview.panoramicImage';
  return { PanoramicImagePreviewProvider: ctor };
});

vi.mock('../providers/PanoramicVideoPreviewProvider', () => {
  const ctor = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setPreviewService = vi.fn();
    this.dispose = vi.fn();
  });
  (ctor as unknown as Record<string, string>).viewType = 'neko.preview.panoramicVideo';
  return { PanoramicVideoPreviewProvider: ctor };
});

vi.mock('../providers/model/ModelPreviewProvider', () => {
  const ctor = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.dispose = vi.fn();
    this.openBuiltinPresetPanel = vi.fn(async () => undefined);
  });
  (ctor as unknown as Record<string, string>).viewType = 'neko.modelPreview';
  return { ModelPreviewProvider: ctor };
});

vi.mock('../ui/StatusBarManager', () => ({
  StatusBarManager: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.show = vi.fn();
    this.hide = vi.fn();
    this.updatePlayback = vi.fn();
    this.dispose = vi.fn();
  }),
}));

import { activate, deactivate } from '../extension';
import { PreviewService } from '../services/PreviewService';
import { VideoPreviewProvider } from '../providers/VideoPreviewProvider';
import { AudioPreviewProvider } from '../providers/AudioPreviewProvider';
import { PanoramicImagePreviewProvider } from '../providers/PanoramicImagePreviewProvider';
import { ModelPreviewProvider } from '../providers/model/ModelPreviewProvider';
import * as vscode from 'vscode';

// ============================================================================
// Helpers
// ============================================================================

function createMockContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    extensionUri: vscode.Uri.file('/ext/neko-preview'),
    extensionPath: '/ext/neko-preview',
    storageUri: vscode.Uri.file('/storage'),
    globalStorageUri: vscode.Uri.file('/global-storage'),
    logUri: vscode.Uri.file('/log'),
    extensionMode: 1,
    environmentVariableCollection: {} as unknown as vscode.GlobalEnvironmentVariableCollection,
    secrets: {} as unknown as vscode.SecretStorage,
    globalState: {} as unknown as vscode.Memento & {
      setKeysForSync: (keys: readonly string[]) => void;
    },
    workspaceState: {} as unknown as vscode.Memento,
    storagePath: '/storage',
    globalStoragePath: '/global-storage',
    logPath: '/log',
    asAbsolutePath: (p: string) => `/ext/neko-preview/${p}`,
    extension: {} as unknown as vscode.Extension<unknown>,
    languageModelAccessInformation: {} as unknown as vscode.LanguageModelAccessInformation,
  } as unknown as vscode.ExtensionContext;
}

// ============================================================================
// Tests
// ============================================================================

describe('extension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.window.showQuickPick).mockImplementation(async (items) => {
      const resolvedItems = await items;
      return resolvedItems[0];
    });
    mockPreviewService.isAvailable = true;
    mockPreviewService.port = 9090;
  });

  describe('activate()', () => {
    it('should not create PreviewService during extension activation', async () => {
      const context = createMockContext();

      await activate(context);

      expect(PreviewService.tryCreate).not.toHaveBeenCalled();
    });

    it('should register VideoPreviewProvider', async () => {
      const context = createMockContext();

      await activate(context);

      expect(vscode.window.registerCustomEditorProvider).toHaveBeenCalledWith(
        'neko.videoPreview',
        expect.anything(),
        expect.objectContaining({
          webviewOptions: { retainContextWhenHidden: true },
          supportsMultipleEditorsPerDocument: false,
        }),
      );
    });

    it('should register ModelPreviewProvider without activating the Engine', async () => {
      const context = createMockContext();

      await activate(context);

      expect(vscode.window.registerCustomEditorProvider).toHaveBeenCalledWith(
        'neko.modelPreview',
        expect.anything(),
        expect.objectContaining({
          webviewOptions: { retainContextWhenHidden: true },
          supportsMultipleEditorsPerDocument: false,
        }),
      );
      expect(PreviewService.tryCreate).not.toHaveBeenCalled();
    });

    it('should register AudioPreviewProvider', async () => {
      const context = createMockContext();

      await activate(context);

      expect(vscode.window.registerCustomEditorProvider).toHaveBeenCalledWith(
        'neko.audioPreview',
        expect.anything(),
        expect.objectContaining({
          webviewOptions: { retainContextWhenHidden: true },
        }),
      );
    });

    it('should register openVideo and openAudio commands', async () => {
      const context = createMockContext();

      await activate(context);

      const registeredCommands = vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.map((call) => call[0]);

      expect(registeredCommands).toContain('neko.preview.openVideo');
      expect(registeredCommands).toContain('neko.preview.openAudio');
      expect(registeredCommands).toContain('neko.preview.openPanoramicImage');
      expect(registeredCommands).toContain('neko.preview.openThreeReferenceGuide');
    });

    it('opens an explicit no-source mannequin guide without selecting a model file', async () => {
      const context = createMockContext();
      await activate(context);
      const registration = vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.find(([command]) => command === 'neko.preview.openThreeReferenceGuide');
      expect(registration).toBeDefined();
      await registration?.[1]();
      const provider = vi.mocked(ModelPreviewProvider).mock.results[0]?.value;
      expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
        [
          expect.objectContaining({ presetId: 'guide-mannequin-female' }),
          expect.objectContaining({ presetId: 'guide-mannequin-male' }),
          expect.objectContaining({ presetId: 'guide-mannequin-child' }),
        ],
        expect.objectContaining({
          placeHolder: 'preview.threeReference.preset.choosePlaceholder',
        }),
      );
      expect(provider.openBuiltinPresetPanel).toHaveBeenCalledWith('guide-mannequin-female');
      expect(vscode.window.showOpenDialog).not.toHaveBeenCalled();
    });

    it('should not depend on active text editor events for EPUB outline sync', async () => {
      const context = createMockContext();

      await activate(context);

      expect(vscode.window.onDidChangeActiveTextEditor).not.toHaveBeenCalled();
    });

    it('should inject one shared lazy PreviewService resolver into media providers', async () => {
      const context = createMockContext();

      await activate(context);

      const videoResolver = vi.mocked(VideoPreviewProvider).mock.calls[0]?.[2];
      const audioResolver = vi.mocked(AudioPreviewProvider).mock.calls[0]?.[2];
      const panoramicResolver = vi.mocked(PanoramicImagePreviewProvider).mock.calls[0]?.[2];

      expect(videoResolver).toBeTypeOf('function');
      expect(audioResolver).toBe(videoResolver);
      expect(panoramicResolver).toBe(videoResolver);
      await videoResolver?.();
      await audioResolver?.();
      expect(PreviewService.tryCreate).toHaveBeenCalledTimes(1);
    });

    it('should push disposables into context.subscriptions', async () => {
      const context = createMockContext();

      await activate(context);

      // PreviewService + StatusBarManager + 2 editor registrations + 2 commands + 2 providers = 8
      expect(context.subscriptions.length).toBeGreaterThanOrEqual(7);
    });

    it('should return a NekoPreviewAPI object', async () => {
      const context = createMockContext();

      const api = await activate(context);

      expect(api).toBeDefined();
      expect(typeof api.isAvailable).toBe('boolean');
      expect(api.port).toBeNull();
      expect(typeof api.getStreamWebSocketUrl).toBe('function');
      expect(typeof api.getPreviewBaseUrl).toBe('function');
      expect(typeof api.probeMedia).toBe('function');
      expect(typeof api.startPlayback).toBe('function');
      expect(typeof api.stopStreams).toBe('function');
      expect(typeof api.seekStreams).toBe('function');
      expect(typeof api.pauseStreams).toBe('function');
      expect(typeof api.resumeStreams).toBe('function');
      expect(typeof api.setStreamSpeed).toBe('function');
      expect(typeof api.captureFrame).toBe('function');
      expect(typeof api.registerPreviewAsset).toBe('function');
      expect(typeof api.requestPreviewVariant).toBe('function');
      expect(typeof api.updatePreviewAssetMetadata).toBe('function');
      expect(typeof api.unregisterPreviewAsset).toBe('function');
    });

    it('should return API with correct availability status', async () => {
      const context = createMockContext();

      const api = await activate(context);

      expect(api.isAvailable).toBe(false);
      expect(api.port).toBeNull();
    });

    it('should fall back to default open for CBR document locator reveals', async () => {
      const context = createMockContext();
      await activate(context);
      vi.mocked(vscode.commands.executeCommand).mockClear();
      const revealCommand = vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.find(([command]) => command === 'neko.preview.revealDocumentLocator');
      const revealHandler = revealCommand?.[1];

      await revealHandler?.({
        filePath: '/books/archive.cbr',
        source: { filePath: '/books/archive.cbr', format: 'cbr' },
        locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
      });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        expect.objectContaining({ fsPath: '/books/archive.cbr' }),
      );
      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        'vscode.openWith',
        expect.anything(),
        'neko.cbzPreview',
      );
    });

    it('should handle PreviewService creation failure gracefully', async () => {
      vi.mocked(PreviewService.tryCreate).mockResolvedValueOnce(null);

      const context = createMockContext();
      const api = await activate(context);

      const resolver = vi.mocked(VideoPreviewProvider).mock.calls[0]?.[2];
      await resolver?.();

      // Should still activate and return API, just not available
      expect(api.isAvailable).toBe(false);
      expect(api.port).toBeNull();
    });

    it('should preserve the lazy resolver when service creation fails', async () => {
      vi.mocked(PreviewService.tryCreate).mockResolvedValueOnce(null);

      const context = createMockContext();
      await activate(context);

      const resolver = vi.mocked(VideoPreviewProvider).mock.calls[0]?.[2];
      await expect(resolver?.()).resolves.toBeNull();
      expect(PreviewService.tryCreate).toHaveBeenCalledTimes(1);
    });

    describe('API methods', () => {
      it('getStreamWebSocketUrl should delegate to PreviewService', async () => {
        const context = createMockContext();
        const api = await activate(context);

        const resolver = vi.mocked(VideoPreviewProvider).mock.calls[0]?.[2];
        await resolver?.();

        const url = api.getStreamWebSocketUrl('stream-abc');

        expect(url).toBe('ws://127.0.0.1:9090/v1/streams/stream-abc');
      });

      it('probeMedia should reject when service is not available', async () => {
        vi.mocked(PreviewService.tryCreate).mockResolvedValueOnce(null);

        const context = createMockContext();
        const api = await activate(context);

        const resolver = vi.mocked(VideoPreviewProvider).mock.calls[0]?.[2];
        await resolver?.();

        await expect(api.probeMedia('/path/to/file')).rejects.toThrow(
          'PreviewService not available',
        );
      });

      it('stopStreams should resolve even when service is not available', async () => {
        vi.mocked(PreviewService.tryCreate).mockResolvedValueOnce(null);

        const context = createMockContext();
        const api = await activate(context);

        const resolver = vi.mocked(VideoPreviewProvider).mock.calls[0]?.[2];
        await resolver?.();

        await expect(api.stopStreams('v1', 'a1')).resolves.toBeUndefined();
      });
    });
  });

  describe('deactivate()', () => {
    it('should not throw when called', () => {
      expect(() => deactivate()).not.toThrow();
    });

    it('should clean up after activation', async () => {
      const context = createMockContext();
      await activate(context);

      expect(() => deactivate()).not.toThrow();
    });
  });
});
