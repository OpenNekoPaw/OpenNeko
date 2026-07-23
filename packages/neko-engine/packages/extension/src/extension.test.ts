import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let activeExtension: { deactivate?: () => Promise<void> } | undefined;

const mockState = vi.hoisted(() => {
  const commands = new Map<string, (...args: unknown[]) => unknown>();

  const outputChannel = {
    appendLine: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
  };

  const statusBarItem = {
    text: '',
    tooltip: '',
    command: undefined as string | undefined,
    backgroundColor: undefined as unknown,
    show: vi.fn(),
    dispose: vi.fn(),
  };

  const nativeEngine = {
    hasGpu: vi.fn(() => true),
    groups: vi.fn(() => ['nodes', 'videos']),
    getFrameServerPort: vi.fn(() => null as number | null),
    startFrameServer: vi.fn(async () => 0),
    startFrameServerWithPreviewRoots: vi.fn(async () => 0),
    setPreviewAllowedRoots: vi.fn(),
    stopFrameServer: vi.fn(async () => undefined),
    dispatchAction: vi.fn(async () => '{"status":"ok"}'),
  };

  const engineWrapper = {
    engine: nativeEngine,
    state: 'ready',
    capabilities: { hardwareAcceleration: true },
    probeMedia: vi.fn(),
  };

  const manager = {
    getCompatibleEngine: vi.fn(async () => engineWrapper),
    disposeEngines: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };

  const exportService = {
    cancel: vi.fn(async () => undefined),
    dispose: vi.fn(),
    initializeWithEngine: vi.fn(),
    export: vi.fn(),
  };

  const showInformationMessage = vi.fn();
  const showWarningMessage = vi.fn();
  const showErrorMessage = vi.fn();
  const showQuickPick = vi.fn();
  const executeCommand = vi.fn(async (id: string, ...args: unknown[]) => {
    const handler = commands.get(id);
    if (!handler) return undefined;
    return await handler(...args);
  });

  const fetch = vi.fn();

  return {
    commands,
    outputChannel,
    statusBarItem,
    nativeEngine,
    engineWrapper,
    manager,
    exportService,
    showInformationMessage,
    showWarningMessage,
    showErrorMessage,
    showQuickPick,
    executeCommand,
    fetch,
  };
});

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(() => createLogger()),
  };
}

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => mockState.outputChannel,
    createStatusBarItem: () => mockState.statusBarItem,
    createTreeView: vi.fn(() => ({ dispose: vi.fn() })),
    showInformationMessage: mockState.showInformationMessage,
    showWarningMessage: mockState.showWarningMessage,
    showErrorMessage: mockState.showErrorMessage,
    showQuickPick: mockState.showQuickPick,
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    withProgress: vi.fn(),
  },
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
      mockState.commands.set(id, handler);
      return { dispose: () => mockState.commands.delete(id) };
    },
    executeCommand: mockState.executeCommand,
  },
  env: {
    openExternal: vi.fn(),
  },
  workspace: {
    workspaceFolders: [
      {
        uri: {
          fsPath: '/workspace',
        },
      },
    ],
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: vi.fn(),
  },
  StatusBarAlignment: {
    Right: 1,
  },
  ProgressLocation: {
    Notification: 1,
  },
  ThemeColor: class {
    constructor(public readonly id: string) {}
  },
  EventEmitter: class<T> {
    private listeners: Array<(event: T) => void> = [];
    event = (listener: (event: T) => void) => {
      this.listeners.push(listener);
      return {
        dispose: () => (this.listeners = this.listeners.filter((entry) => entry !== listener)),
      };
    };
    fire(event: T) {
      for (const listener of this.listeners) listener(event);
    }
    dispose() {
      this.listeners = [];
    }
  },
  TreeItem: class {
    description: string | undefined;
    contextValue: string | undefined;
    tooltip: string | undefined;
    constructor(
      public readonly label: string,
      public readonly collapsibleState: number,
    ) {}
  },
  TreeItemCollapsibleState: {
    None: 0,
  },
}));

vi.mock('./mediaEngine', () => ({
  MediaEngineManager: class {},
  NativeMediaEngine: class {},
  createMediaEngineManager: vi.fn(() => mockState.manager),
}));

vi.mock('./mediaEngine/export', () => ({
  ExportService: class {
    _isInitialized = false;
    cancel = mockState.exportService.cancel;
    dispose = mockState.exportService.dispose;
    initializeWithEngine = mockState.exportService.initializeWithEngine;
    export = mockState.exportService.export;
  },
  JviProjectLoader: class {},
  VideoFrameProvider: class {},
  createVideoFrameProvider: vi.fn(),
}));

vi.mock('@neko/shared/vscode/extension', () => ({
  createVSCodeLogger: vi.fn(() => createLogger()),
  registerOptionalAgentCapabilityProvider: vi.fn(async () => false),
  VSCodeErrorHandler: class {
    handleError = vi.fn(async () => undefined);
  },
  resolveLogLevelSetting: vi.fn(() => 'debug'),
  watchLogLevel: vi.fn(),
}));

async function activateExtension() {
  await activeExtension?.deactivate?.();
  activeExtension = undefined;
  vi.resetModules();
  mockState.commands.clear();

  const extension = await import('./extension');
  const context = {
    subscriptions: [] as { dispose?: () => void }[],
    extensionUri: { fsPath: '/tmp/extension' },
    asAbsolutePath: vi.fn((relativePath: string) => `/tmp/extension/${relativePath}`),
    globalStorageUri: { fsPath: '/tmp/storage' },
    globalState: {
      get: vi.fn(() => undefined),
      update: vi.fn(async () => undefined),
    },
    workspaceState: {
      get: vi.fn(() => undefined),
      update: vi.fn(async () => undefined),
    },
  };

  await extension.activate(context as never);
  activeExtension = extension;

  return { extension, context };
}

describe('neko-engine extension command bridge', () => {
  beforeAll(async () => {
    // Keep the first Vite transform outside individual test timeouts. Under
    // Linux/amd64 emulation, compiling this extension entry can exceed 5s.
    await import('./extension');
    vi.resetModules();
  }, 30_000);

  beforeEach(async () => {
    await activeExtension?.deactivate?.();
    activeExtension = undefined;
    vi.resetModules();
    mockState.commands.clear();
    mockState.outputChannel.appendLine.mockClear();
    mockState.outputChannel.show.mockClear();
    mockState.statusBarItem.show.mockClear();
    mockState.showInformationMessage.mockClear();
    mockState.showWarningMessage.mockClear();
    mockState.showErrorMessage.mockClear();
    mockState.showQuickPick.mockClear();
    mockState.executeCommand.mockClear();
    mockState.manager.getCompatibleEngine.mockClear();
    mockState.manager.disposeEngines.mockClear();
    Object.assign(mockState.manager, { frameServerPort: undefined });
    mockState.exportService.cancel.mockClear();
    mockState.exportService.dispose.mockClear();
    mockState.exportService.initializeWithEngine.mockClear();
    mockState.nativeEngine.getFrameServerPort.mockReset();
    mockState.nativeEngine.getFrameServerPort.mockReturnValue(null);
    mockState.nativeEngine.startFrameServer.mockReset();
    mockState.nativeEngine.startFrameServer.mockResolvedValue(1234);
    mockState.nativeEngine.startFrameServerWithPreviewRoots.mockReset();
    mockState.nativeEngine.startFrameServerWithPreviewRoots.mockResolvedValue(1234);
    mockState.nativeEngine.setPreviewAllowedRoots.mockReset();
    mockState.nativeEngine.stopFrameServer.mockReset();
    mockState.nativeEngine.stopFrameServer.mockResolvedValue(undefined);
    mockState.nativeEngine.dispatchAction.mockReset();
    mockState.nativeEngine.dispatchAction.mockResolvedValue('{"status":"ok"}');
    mockState.fetch.mockReset();
    vi.stubGlobal('fetch', mockState.fetch);
  });

  it('reuses an already running frame server reported by the native engine', async () => {
    mockState.nativeEngine.getFrameServerPort.mockReturnValue(4321);
    mockState.fetch.mockResolvedValue({ ok: true });

    await activateExtension();

    const result = await mockState.executeCommand('neko.engine.ensureFrameServer');

    expect(result).toEqual({ port: 4321 });
    expect(mockState.nativeEngine.startFrameServer).not.toHaveBeenCalled();
    expect(mockState.nativeEngine.startFrameServerWithPreviewRoots).not.toHaveBeenCalled();
    expect(mockState.fetch).toHaveBeenCalledWith('http://127.0.0.1:4321/health', {
      signal: expect.any(AbortSignal),
    });
  });

  it('reports runtime status without starting the frame server', async () => {
    Object.assign(mockState.manager, { frameServerPort: 6789 });

    await activateExtension();

    const result = await mockState.executeCommand('neko.engine.getStatus');

    expect(result).toEqual({
      state: 'idle',
      endpoint: {
        host: '127.0.0.1',
        port: 6789,
        address: '127.0.0.1:6789',
        url: 'http://127.0.0.1:6789',
      },
      health: 'unknown',
    });
    expect(mockState.manager.getCompatibleEngine).not.toHaveBeenCalled();
    expect(mockState.nativeEngine.startFrameServerWithPreviewRoots).not.toHaveBeenCalled();
  });

  it('coalesces concurrent frame server ensure calls into one native start', async () => {
    await activateExtension();

    const [first, second, third] = await Promise.all([
      mockState.executeCommand('neko.engine.ensureFrameServer'),
      mockState.executeCommand('neko.engine.ensureFrameServer'),
      mockState.executeCommand('neko.engine.ensureFrameServer'),
    ]);

    expect(first).toEqual({ port: 1234 });
    expect(second).toEqual({ port: 1234 });
    expect(third).toEqual({ port: 1234 });
    expect(mockState.nativeEngine.startFrameServerWithPreviewRoots).toHaveBeenCalledTimes(1);
    expect(mockState.nativeEngine.stopFrameServer).not.toHaveBeenCalled();
  });

  it('merges preview roots from coalesced ensure calls before serving files', async () => {
    let releaseStart!: () => void;
    mockState.nativeEngine.startFrameServerWithPreviewRoots.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          releaseStart = () => resolve(1234);
        }),
    );

    await activateExtension();

    const first = mockState.executeCommand('neko.engine.ensureFrameServer', [
      '/workspace',
      '/media/a',
    ]);
    const second = mockState.executeCommand('neko.engine.ensureFrameServer', ['/media/b']);

    await vi.waitFor(() =>
      expect(mockState.nativeEngine.startFrameServerWithPreviewRoots).toHaveBeenCalledTimes(1),
    );
    releaseStart?.();

    await expect(Promise.all([first, second])).resolves.toEqual([{ port: 1234 }, { port: 1234 }]);
    expect(mockState.nativeEngine.startFrameServerWithPreviewRoots).toHaveBeenCalledTimes(1);
    expect(mockState.nativeEngine.startFrameServerWithPreviewRoots).toHaveBeenCalledWith(0, [
      '/workspace',
      '/media/a',
      '/media/b',
    ]);
    expect(mockState.nativeEngine.setPreviewAllowedRoots).toHaveBeenLastCalledWith([
      '/workspace',
      '/media/a',
      '/media/b',
    ]);
  });

  it('retries frame server health before restarting an existing port', async () => {
    mockState.nativeEngine.getFrameServerPort.mockReturnValue(4321);
    mockState.fetch
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new Error('transient connection reset'))
      .mockResolvedValueOnce({ ok: true });

    await activateExtension();

    const result = await mockState.executeCommand('neko.engine.ensureFrameServer');

    expect(result).toEqual({ port: 4321 });
    expect(mockState.fetch).toHaveBeenCalledTimes(3);
    expect(mockState.nativeEngine.stopFrameServer).not.toHaveBeenCalled();
    expect(mockState.nativeEngine.startFrameServerWithPreviewRoots).not.toHaveBeenCalled();
  });

  it('restarts the embedded frame server when the cached port is stale', async () => {
    mockState.nativeEngine.startFrameServerWithPreviewRoots
      .mockResolvedValueOnce(1234)
      .mockResolvedValueOnce(5678);
    mockState.fetch.mockResolvedValue({ ok: false });

    await activateExtension();

    const first = await mockState.executeCommand('neko.engine.ensureFrameServer');
    const second = await mockState.executeCommand('neko.engine.ensureFrameServer');

    expect(first).toEqual({ port: 1234 });
    expect(second).toEqual({ port: 5678 });
    expect(mockState.nativeEngine.stopFrameServer).toHaveBeenCalledTimes(1);
    expect(mockState.nativeEngine.startFrameServerWithPreviewRoots).toHaveBeenCalledTimes(2);
    expect(mockState.fetch).toHaveBeenCalledTimes(3);
    expect(mockState.nativeEngine.startFrameServerWithPreviewRoots).toHaveBeenCalledWith(0, [
      '/workspace',
    ]);
  });

  it('forwards generic dispatch commands through NativeEngine.dispatchAction', async () => {
    mockState.nativeEngine.dispatchAction.mockResolvedValue('{"status":"ok","data":{"pong":true}}');

    await activateExtension();

    const result = await mockState.executeCommand('neko.engine.dispatch', 'nodes', 'health', {
      verbose: true,
    });

    expect(result).toBe('{"status":"ok","data":{"pong":true}}');
    expect(mockState.nativeEngine.dispatchAction).toHaveBeenCalledWith(
      'nodes',
      'health',
      null,
      JSON.stringify({ verbose: true }),
      null,
      null,
      null,
      null,
    );
  });

  it('does not own device-management commands', async () => {
    await activateExtension();

    expect(mockState.commands.has('neko.devices.list')).toBe(false);
  });
});
