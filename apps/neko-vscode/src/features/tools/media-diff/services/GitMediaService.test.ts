import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getExtensionMock } = vi.hoisted(() => ({
  getExtensionMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  extensions: {
    getExtension: getExtensionMock,
  },
  workspace: {
    getWorkspaceFolder: vi.fn(),
    fs: {
      readFile: vi.fn(),
    },
  },
}));

import type * as vscode from 'vscode';
import { GitMediaService } from './GitMediaService';
import type { IGitCliGateway } from './GitCliGateway';

interface EnablementHarness {
  readonly extensionApi: {
    enabled: boolean;
    onDidChangeEnablement: vscode.Event<boolean>;
    getAPI: ReturnType<typeof vi.fn>;
  };
  fire(enabled: boolean): void;
  readonly listenerDisposable: { dispose: ReturnType<typeof vi.fn> };
}

function createEnablementHarness(getAPI: ReturnType<typeof vi.fn>): EnablementHarness {
  let listener: ((enabled: boolean) => void) | undefined;
  const listenerDisposable = { dispose: vi.fn() };
  const extensionApi = {
    enabled: false,
    onDidChangeEnablement: ((candidate: (enabled: boolean) => void) => {
      listener = candidate;
      return listenerDisposable;
    }) as vscode.Event<boolean>,
    getAPI,
  };

  return {
    extensionApi,
    listenerDisposable,
    fire(enabled: boolean) {
      extensionApi.enabled = enabled;
      listener?.(enabled);
    },
  };
}

function createGitCliGateway(): IGitCliGateway {
  return {
    getFileAtCommit: vi.fn(),
    isTracked: vi.fn(),
    getFileHistory: vi.fn(),
    extractFileToPath: vi.fn(),
  };
}

describe('GitMediaService Git extension lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats a disabled Git extension as an unavailable optional integration', async () => {
    const getAPI = vi.fn();
    const harness = createEnablementHarness(getAPI);
    getExtensionMock.mockReturnValue({
      isActive: true,
      exports: harness.extensionApi,
    });

    const service = new GitMediaService(createGitCliGateway());

    await expect(service.getChangedMediaFiles()).resolves.toEqual([]);
    expect(service.isReady()).toBe(false);
    expect(getAPI).not.toHaveBeenCalled();

    service.dispose();
    expect(harness.listenerDisposable.dispose).toHaveBeenCalledOnce();
  });

  it('connects and disconnects when Git extension enablement changes', async () => {
    const repository = { rootUri: { fsPath: '/repo' } };
    const openListenerDisposable = { dispose: vi.fn() };
    const closeListenerDisposable = { dispose: vi.fn() };
    const gitApi = {
      repositories: [repository],
      onDidOpenRepository: vi.fn(() => openListenerDisposable),
      onDidCloseRepository: vi.fn(() => closeListenerDisposable),
    };
    const getAPI = vi.fn(() => gitApi);
    const harness = createEnablementHarness(getAPI);
    getExtensionMock.mockReturnValue({
      isActive: true,
      exports: harness.extensionApi,
    });

    const service = new GitMediaService(createGitCliGateway());
    await expect(service.getChangedMediaFiles()).resolves.toEqual([]);

    harness.fire(true);
    expect(service.isReady()).toBe(true);
    expect(getAPI).toHaveBeenCalledWith(1);

    harness.fire(false);
    expect(service.isReady()).toBe(false);
    expect(openListenerDisposable.dispose).toHaveBeenCalledOnce();
    expect(closeListenerDisposable.dispose).toHaveBeenCalledOnce();

    service.dispose();
    expect(harness.listenerDisposable.dispose).toHaveBeenCalledOnce();
  });
});
