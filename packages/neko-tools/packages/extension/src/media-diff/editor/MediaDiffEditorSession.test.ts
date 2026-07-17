import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  l10n: {
    t: vi.fn((key: string) => key),
  },
}));

import type * as vscode from 'vscode';
import { MediaDiffEditorSession } from './MediaDiffEditorSession';
import { MediaDiffEditorSessionFactory } from './MediaDiffEditorSessionFactory';
import type { IMediaDiffEditorMessageHandler } from './MediaDiffEditorSession';
import type { IEngineMediaService } from '../../contracts/IEngineMediaService';
import type { IScheduler } from '../../contracts/IScheduler';
import type { ITempFileService } from '../../contracts/ITempFileService';
import type { MediaDiffService } from '../services/MediaDiffService';

function createMockDisposable() {
  return { dispose: vi.fn() };
}

function createMockWebviewPanel() {
  const receiveDisposable = createMockDisposable();
  const disposeDisposable = createMockDisposable();

  const webview = {
    postMessage: vi.fn(),
    onDidReceiveMessage: vi.fn().mockReturnValue(receiveDisposable),
  };

  const panel = {
    webview,
    onDidDispose: vi.fn().mockReturnValue(disposeDisposable),
  };

  return {
    panel: panel as unknown as vscode.WebviewPanel,
    webview,
    receiveDisposable,
    disposeDisposable,
  };
}

function createMockMessageHandler(): IMediaDiffEditorMessageHandler {
  return {
    initializeDiff: vi.fn().mockResolvedValue(undefined),
    handleMessage: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    disposeAsync: vi.fn().mockResolvedValue(undefined),
  };
}

describe('MediaDiffEditorSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should attach listeners and initialize diff when recompare is not required', async () => {
    const { panel, webview } = createMockWebviewPanel();
    const handler = createMockMessageHandler();
    const session = new MediaDiffEditorSession(panel, handler, true);
    const onDidDispose = vi.fn();

    session.attach(onDidDispose);
    await session.start(false);

    expect(panel.webview.onDidReceiveMessage).toHaveBeenCalledTimes(1);
    expect(panel.onDidDispose).toHaveBeenCalledTimes(1);
    expect(handler.initializeDiff).toHaveBeenCalledTimes(1);
    expect(webview.postMessage).not.toHaveBeenCalled();
  });

  it('should skip initializeDiff when session requires recompare', async () => {
    const { panel } = createMockWebviewPanel();
    const handler = createMockMessageHandler();
    const session = new MediaDiffEditorSession(panel, handler, true);

    await session.start(true);

    expect(handler.initializeDiff).not.toHaveBeenCalled();
  });

  it('should notify webview and skip initialization when engine client is unavailable', async () => {
    const { panel, webview } = createMockWebviewPanel();
    const handler = createMockMessageHandler();
    const session = new MediaDiffEditorSession(panel, handler, false);

    await session.start(false);

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'mediaDiff:error',
      error: 'mediaDiff.error.engineUnavailable',
    });
    expect(handler.initializeDiff).not.toHaveBeenCalled();
  });

  it('should dispose listeners and handler only once', async () => {
    const { panel, receiveDisposable, disposeDisposable } = createMockWebviewPanel();
    const handler = createMockMessageHandler();
    const session = new MediaDiffEditorSession(panel, handler, true);

    session.attach(vi.fn());
    await session.disposeAsync();
    await session.disposeAsync();

    expect(receiveDisposable.dispose).toHaveBeenCalledTimes(1);
    expect(disposeDisposable.dispose).toHaveBeenCalledTimes(1);
    expect(handler.disposeAsync).toHaveBeenCalledTimes(1);
  });
});

describe('MediaDiffEditorSessionFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create session with resolved engine client and message handler factory', async () => {
    const { panel } = createMockWebviewPanel();
    const documentUri = { toString: () => 'file:///demo.mp4' } as vscode.Uri;
    const previousUri = { toString: () => 'file:///demo.prev.mp4' } as vscode.Uri;
    const diffService = {} as MediaDiffService;
    const engineClient = { baseUrl: 'http://127.0.0.1:9999' };
    const engineMediaService: IEngineMediaService = {
      ensureClient: vi.fn().mockResolvedValue(engineClient),
      diff: vi.fn(),
      detectSilence: vi.fn(),
      probe: vi.fn(),
    };
    const tempFileService: ITempFileService = {
      createTempPath: vi.fn(),
      writeTempFile: vi.fn(),
      deleteTempFile: vi.fn(),
    };
    const scheduler: IScheduler = {
      scheduleOnce: vi.fn(),
      wait: vi.fn(),
    };
    const messageHandler = createMockMessageHandler();
    const createMessageHandler = vi.fn().mockReturnValue(messageHandler);
    const factory = new MediaDiffEditorSessionFactory(
      diffService,
      engineMediaService,
      scheduler,
      tempFileService,
      createMessageHandler,
    );

    const session = await factory.createSession({
      webviewPanel: panel,
      documentUri,
      previousUri,
    });

    expect(engineMediaService.ensureClient).toHaveBeenCalledTimes(1);
    expect(createMessageHandler).toHaveBeenCalledWith({
      webview: panel.webview,
      documentUri,
      diffService,
      engineClient,
      scheduler,
      tempFileService,
      previousUri,
    });

    await session.start(false);
    expect(messageHandler.initializeDiff).toHaveBeenCalledTimes(1);
  });

  it('should rethrow message handler factory failures', async () => {
    const { panel } = createMockWebviewPanel();
    const documentUri = { toString: () => 'file:///demo.mp4' } as vscode.Uri;
    const diffService = {} as MediaDiffService;
    const engineMediaService: IEngineMediaService = {
      ensureClient: vi.fn().mockResolvedValue(null),
      diff: vi.fn(),
      detectSilence: vi.fn(),
      probe: vi.fn(),
    };
    const tempFileService: ITempFileService = {
      createTempPath: vi.fn(),
      writeTempFile: vi.fn(),
      deleteTempFile: vi.fn(),
    };
    const scheduler: IScheduler = {
      scheduleOnce: vi.fn(),
      wait: vi.fn(),
    };
    const createMessageHandler = vi.fn(() => {
      throw new Error('handler failure');
    });
    const factory = new MediaDiffEditorSessionFactory(
      diffService,
      engineMediaService,
      scheduler,
      tempFileService,
      createMessageHandler,
    );

    await expect(
      factory.createSession({
        webviewPanel: panel,
        documentUri,
      }),
    ).rejects.toThrow('handler failure');
  });
});
