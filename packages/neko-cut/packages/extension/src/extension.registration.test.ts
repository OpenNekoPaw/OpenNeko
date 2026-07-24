import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';

const vscodeMocks = vi.hoisted(() => ({
  registerCustomEditorProvider: vi.fn(
    (_viewType: string, _provider: unknown, _options: unknown) => ({ dispose: vi.fn() }),
  ),
  registerCommand: vi.fn((_command: string, _callback: (...args: unknown[]) => unknown) => ({
    dispose: vi.fn(),
  })),
}));

vi.mock('vscode', () => ({
  window: { registerCustomEditorProvider: vscodeMocks.registerCustomEditorProvider },
  commands: {
    registerCommand: vscodeMocks.registerCommand,
    executeCommand: vi.fn(),
  },
}));

vi.mock('@neko/shared/vscode/extension', () => ({
  createVSCodeLogger: () => ({ info: vi.fn() }),
  resolveLogLevelSetting: vi.fn(),
  VSCodeErrorHandler: class {},
  watchLogLevel: vi.fn(),
}));

vi.mock('./base', () => ({
  getRootLogger: () => ({ info: vi.fn() }),
  setErrorHandler: vi.fn(),
  setRootLogger: vi.fn(),
}));

vi.mock('./editor/CutOtioEditorProvider', () => ({
  CutOtioEditorProvider: class {
    handoffRoute = vi.fn();
  },
  createNewOtioProject: vi.fn(),
}));

vi.mock('./views/statusBar', () => ({
  OPEN_CUT_DOCUMENT_STATUS_COMMAND: 'neko.cut.openStatusDocument',
  OPEN_CUT_EXPORT_TASK_COMMAND: 'neko.cut.openExportTask',
  StatusBar: class {
    update = vi.fn();
    updateDocument = vi.fn();
    openCurrentDocument = vi.fn();
    openCurrentTaskDocument = vi.fn();
    dispose = vi.fn();
  },
}));

import { activate } from './extension';

describe('Cut extension registration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers only the OTIO editor as the writable Cut project surface', async () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
      extensionMode: 1,
    };

    const api = await activate(context as vscode.ExtensionContext);
    expect(api.status).toBe('ready');
    expect(api.routes.handoff).toEqual(expect.any(Function));
    expect(vscodeMocks.registerCustomEditorProvider).toHaveBeenCalledWith(
      'neko.cut.otioEditor',
      expect.anything(),
      {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: { retainContextWhenHidden: false },
      },
    );
    expect(vscodeMocks.registerCommand.mock.calls.map(([command]) => command)).toEqual([
      'neko.cut.openExportTask',
      'neko.cut.openStatusDocument',
      'neko.cut.newProject',
      'neko.cut.previewMedia',
    ]);
  });
});
