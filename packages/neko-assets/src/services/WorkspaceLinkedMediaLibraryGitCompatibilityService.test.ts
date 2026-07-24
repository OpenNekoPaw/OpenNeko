import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { initI18n } from '../i18n';
import { WorkspaceLinkedMediaLibraryGitCompatibilityService } from './WorkspaceLinkedMediaLibraryGitCompatibilityService';

const { get, inspect, update, getConfiguration, showWarningMessage, showInformationMessage } =
  vi.hoisted(() => ({
    get: vi.fn(),
    inspect: vi.fn(),
    update: vi.fn(),
    getConfiguration: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  }));

vi.mock('vscode', () => ({
  ConfigurationTarget: { WorkspaceFolder: 3 },
  workspace: { getConfiguration },
  window: { showWarningMessage, showInformationMessage },
}));

describe('WorkspaceLinkedMediaLibraryGitCompatibilityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initI18n('en');
    get.mockReturnValue(true);
    inspect.mockReturnValue({ key: 'git.enabled', workspaceFolderValue: undefined });
    update.mockResolvedValue(undefined);
    getConfiguration.mockReturnValue({ get, inspect, update });
    showInformationMessage.mockResolvedValue(undefined);
  });

  it('disables built-in Git at WorkspaceFolder scope only after explicit confirmation', async () => {
    const state = createState();
    const folder = createWorkspaceFolder('/workspace');
    showWarningMessage.mockResolvedValue('Disable Git for This Folder');
    const service = new WorkspaceLinkedMediaLibraryGitCompatibilityService(folder, state.memento);

    await expect(service.reconcile(true)).resolves.toBe('disabled');

    expect(getConfiguration).toHaveBeenCalledWith('git', folder.uri);
    expect(update).toHaveBeenCalledWith(
      'enabled',
      false,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    expect(state.entries()).toContainEqual([
      expect.stringContaining('git-integration-ownership.v1'),
      expect.objectContaining({ status: 'owned', hadExplicitWorkspaceFolderValue: false }),
    ]);
  });

  it('keeps Git enabled when the user declines and does not prompt twice', async () => {
    const state = createState();
    showWarningMessage.mockResolvedValue('Keep Git Enabled');
    const service = new WorkspaceLinkedMediaLibraryGitCompatibilityService(
      createWorkspaceFolder('/workspace'),
      state.memento,
    );

    await expect(service.reconcile(true)).resolves.toBe('kept-enabled');
    await expect(service.reconcile(true)).resolves.toBe('not-selected');

    expect(showWarningMessage).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });

  it('does not prompt, inspect, or write Git configuration without a linked library or ownership', async () => {
    const state = createState();
    const service = new WorkspaceLinkedMediaLibraryGitCompatibilityService(
      createWorkspaceFolder('/workspace'),
      state.memento,
    );

    await expect(service.reconcile(false)).resolves.toBe('not-owned');

    expect(showWarningMessage).not.toHaveBeenCalled();
    expect(getConfiguration).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('does not claim ownership when Git is already disabled', async () => {
    get.mockReturnValue(false);
    inspect.mockReturnValue({ key: 'git.enabled', workspaceFolderValue: false });
    const state = createState();
    const service = new WorkspaceLinkedMediaLibraryGitCompatibilityService(
      createWorkspaceFolder('/workspace'),
      state.memento,
    );

    await expect(service.reconcile(true)).resolves.toBe('already-disabled');

    expect(showWarningMessage).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(state.entries()).toHaveLength(0);
  });

  it('removes its folder setting after the final link when no explicit value existed', async () => {
    const state = createState();
    showWarningMessage.mockResolvedValue('Disable Git for This Folder');
    const service = new WorkspaceLinkedMediaLibraryGitCompatibilityService(
      createWorkspaceFolder('/workspace'),
      state.memento,
    );
    await service.reconcile(true);
    get.mockReturnValue(false);
    inspect.mockReturnValue({ key: 'git.enabled', workspaceFolderValue: false });

    await expect(service.reconcile(false)).resolves.toBe('restored');

    expect(update).toHaveBeenNthCalledWith(
      2,
      'enabled',
      undefined,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    expect(state.entries()).toHaveLength(0);
  });

  it('restores the prior explicit folder value after the final link', async () => {
    inspect.mockReturnValue({ key: 'git.enabled', workspaceFolderValue: true });
    const state = createState();
    showWarningMessage.mockResolvedValue('Disable Git for This Folder');
    const service = new WorkspaceLinkedMediaLibraryGitCompatibilityService(
      createWorkspaceFolder('/workspace'),
      state.memento,
    );
    await service.reconcile(true);
    get.mockReturnValue(false);
    inspect.mockReturnValue({ key: 'git.enabled', workspaceFolderValue: false });

    await expect(service.reconcile(false)).resolves.toBe('restored');

    expect(update).toHaveBeenNthCalledWith(
      2,
      'enabled',
      true,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
  });

  it('preserves a user change made after the plugin disabled Git', async () => {
    const state = createState();
    showWarningMessage.mockResolvedValue('Disable Git for This Folder');
    const service = new WorkspaceLinkedMediaLibraryGitCompatibilityService(
      createWorkspaceFolder('/workspace'),
      state.memento,
    );
    await service.reconcile(true);
    inspect.mockReturnValue({ key: 'git.enabled', workspaceFolderValue: true });

    await expect(service.reconcile(false)).resolves.toBe('user-value-preserved');

    expect(update).toHaveBeenCalledOnce();
    expect(state.entries()).toHaveLength(0);
  });

  it('serializes final-link removal behind an in-flight confirmation', async () => {
    const selection = createDeferred<string | undefined>();
    const state = createState();
    showWarningMessage.mockReturnValue(selection.promise);
    update.mockImplementation(async (_section: string, value: boolean | undefined) => {
      if (value === false) {
        get.mockReturnValue(false);
        inspect.mockReturnValue({ key: 'git.enabled', workspaceFolderValue: false });
      }
    });
    const service = new WorkspaceLinkedMediaLibraryGitCompatibilityService(
      createWorkspaceFolder('/workspace'),
      state.memento,
    );

    const disable = service.reconcile(true);
    const restore = service.reconcile(false);
    await vi.waitFor(() => expect(showWarningMessage).toHaveBeenCalledOnce());
    selection.resolve('Disable Git for This Folder');

    await expect(disable).resolves.toBe('disabled');
    await expect(restore).resolves.toBe('restored');
    expect(update).toHaveBeenNthCalledWith(
      1,
      'enabled',
      false,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      'enabled',
      undefined,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
  });

  it('scopes prompt and ownership state to the owning workspace folder', async () => {
    const state = createState();
    const first = createWorkspaceFolder('/workspace-a');
    const second = createWorkspaceFolder('/workspace-b');
    showWarningMessage.mockResolvedValue('Keep Git Enabled');
    const firstService = new WorkspaceLinkedMediaLibraryGitCompatibilityService(
      first,
      state.memento,
    );
    const secondService = new WorkspaceLinkedMediaLibraryGitCompatibilityService(
      second,
      state.memento,
    );

    await expect(firstService.reconcile(true)).resolves.toBe('kept-enabled');
    await expect(secondService.reconcile(true)).resolves.toBe('kept-enabled');

    expect(showWarningMessage).toHaveBeenCalledTimes(2);
    expect(getConfiguration).toHaveBeenNthCalledWith(1, 'git', first.uri);
    expect(getConfiguration).toHaveBeenNthCalledWith(2, 'git', second.uri);
  });

  it('fails visibly when VS Code does not register git.enabled', async () => {
    inspect.mockReturnValue(undefined);
    const service = new WorkspaceLinkedMediaLibraryGitCompatibilityService(
      createWorkspaceFolder('/workspace'),
      createState().memento,
    );

    await expect(service.reconcile(true)).rejects.toThrow(
      'VS Code setting "git.enabled" is not registered.',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('fails visibly and releases pending ownership when the configuration write fails', async () => {
    update.mockRejectedValueOnce(new Error('settings write failed'));
    showWarningMessage.mockResolvedValue('Disable Git for This Folder');
    const state = createState();
    const service = new WorkspaceLinkedMediaLibraryGitCompatibilityService(
      createWorkspaceFolder('/workspace'),
      state.memento,
    );

    await expect(service.reconcile(true)).rejects.toThrow('settings write failed');

    expect(state.entries()).toHaveLength(0);
    expect(showInformationMessage).not.toHaveBeenCalled();
  });
});

function createWorkspaceFolder(fsPath: string): vscode.WorkspaceFolder {
  const uri = {
    fsPath,
    toString: () => `file://${fsPath}`,
  } as vscode.Uri;
  return { uri, name: fsPath.slice(fsPath.lastIndexOf('/') + 1), index: 0 };
}

function createState(): {
  readonly memento: vscode.Memento;
  readonly entries: () => [string, unknown][];
} {
  const values = new Map<string, unknown>();
  return {
    memento: {
      get: vi.fn((key: string, fallback?: unknown) => values.get(key) ?? fallback),
      update: vi.fn(async (key: string, value: unknown) => {
        if (value === undefined) values.delete(key);
        else values.set(key, value);
      }),
      keys: vi.fn(() => [...values.keys()]),
    } as vscode.Memento,
    entries: () => [...values.entries()],
  };
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
