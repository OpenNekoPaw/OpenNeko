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
import type {
  IMediaRuntimeService,
  IToolsMediaRuntime,
} from '../../contracts/IMediaRuntimeService';
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
    handleMessage: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    disposeAsync: vi.fn().mockResolvedValue(undefined),
  };
}

describe('MediaDiffEditorSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches listeners without starting an uncorrelated host-side analysis', async () => {
    const { panel, webview } = createMockWebviewPanel();
    const handler = createMockMessageHandler();
    const session = new MediaDiffEditorSession(panel, handler, 'session-1');
    const onDidDispose = vi.fn();

    session.attach(onDidDispose);
    await session.start(false);

    expect(panel.webview.onDidReceiveMessage).toHaveBeenCalledTimes(1);
    expect(panel.onDidDispose).toHaveBeenCalledTimes(1);
    expect(webview.postMessage).not.toHaveBeenCalled();
  });

  it('should skip initializeDiff when session requires recompare', async () => {
    const { panel } = createMockWebviewPanel();
    const handler = createMockMessageHandler();
    const session = new MediaDiffEditorSession(panel, handler, 'session-1');

    await session.start(true);

    expect(handler.handleMessage).not.toHaveBeenCalled();
  });

  it('should dispose listeners and handler only once', async () => {
    const { panel, receiveDisposable, disposeDisposable } = createMockWebviewPanel();
    const handler = createMockMessageHandler();
    const session = new MediaDiffEditorSession(panel, handler, 'session-1');

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

  it('should create a session with the canonical media runtime', async () => {
    const { panel } = createMockWebviewPanel();
    const documentUri = { toString: () => 'file:///demo.mp4' } as vscode.Uri;
    const previousUri = { toString: () => 'file:///demo.prev.mp4' } as vscode.Uri;
    const diffService = {} as MediaDiffService;
    const mediaRuntime = {} as IToolsMediaRuntime;
    const mediaRuntimeService: IMediaRuntimeService = {
      runtime: mediaRuntime,
      compare: vi.fn(),
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
      mediaRuntimeService,
      scheduler,
      tempFileService,
      createMessageHandler,
    );

    const session = await factory.createSession({
      webviewPanel: panel,
      documentUri,
      sessionId: 'session-1',
      previousUri,
    });

    expect(createMessageHandler).toHaveBeenCalledWith({
      webview: panel.webview,
      documentUri,
      sessionId: 'session-1',
      diffService,
      mediaRuntime,
      scheduler,
      tempFileService,
      previousUri,
    });

    await session.start(false);
    expect(messageHandler.handleMessage).not.toHaveBeenCalled();
  });

  it('should rethrow message handler factory failures', async () => {
    const { panel } = createMockWebviewPanel();
    const documentUri = { toString: () => 'file:///demo.mp4' } as vscode.Uri;
    const diffService = {} as MediaDiffService;
    const mediaRuntimeService: IMediaRuntimeService = {
      runtime: {} as IToolsMediaRuntime,
      compare: vi.fn(),
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
      mediaRuntimeService,
      scheduler,
      tempFileService,
      createMessageHandler,
    );

    await expect(
      factory.createSession({
        webviewPanel: panel,
        documentUri,
        sessionId: 'session-1',
      }),
    ).rejects.toThrow('handler failure');
  });
});
