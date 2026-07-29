import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CutExportTaskSnapshot } from '@neko-cut/domain';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  setVisible: vi.fn(),
  show: vi.fn(),
  dispose: vi.fn(),
  item: { backgroundColor: undefined as unknown },
  executeCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  StatusBarAlignment: { Left: 1, Right: 2 },
  ThemeColor: class {
    constructor(readonly id: string) {}
  },
  Uri: { parse: (value: string) => ({ value }) },
  commands: { executeCommand: mocks.executeCommand },
  l10n: {
    t: (message: string, ...args: unknown[]) =>
      args.reduce(
        (value, argument, index) => String(value).replace(`{${index}}`, String(argument)),
        message,
      ),
  },
}));

vi.mock('@neko/shared/vscode/extension', () => ({
  StatusBarGroup: class {
    show = mocks.show;
    update = mocks.update;
    setVisible = mocks.setVisible;
    dispose = mocks.dispose;
    get = () => mocks.item;
  },
}));

import { StatusBar } from './statusBar';

function task(overrides: Partial<CutExportTaskSnapshot> = {}): CutExportTaskSnapshot {
  return {
    jobId: 'job-1',
    documentUri: 'file:///workspace/cuts/scene.otio',
    sessionId: 'session-1',
    sourceRevision: 3,
    settings: {
      outputName: 'Project',
      container: 'mp4',
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      videoBitrate: 8_000_000,
      includeAudio: true,
      audioBitrate: 192_000,
      audioSampleRate: 48_000,
    },
    outputWorkspaceRelativePath: 'exports/scene.mp4',
    status: 'running',
    startedAt: 100,
    ...overrides,
  };
}

describe('Cut StatusBar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the document explicitly owned by the projected task', async () => {
    const statusBar = new StatusBar();
    statusBar.update(task({ documentUri: 'file:///workspace/cuts/owned.otio' }));

    await statusBar.openCurrentTaskDocument();

    expect(mocks.executeCommand).toHaveBeenCalledWith(
      'vscode.openWith',
      { value: 'file:///workspace/cuts/owned.otio' },
      'neko.cut.otioEditor',
    );
  });

  it('fails visibly when navigation has no task identity', async () => {
    const statusBar = new StatusBar();
    await expect(statusBar.openCurrentTaskDocument()).rejects.toThrow(
      'No Cut export task is available',
    );
  });

  it('projects and navigates the explicitly active Cut document independently of export tasks', async () => {
    const statusBar = new StatusBar();
    statusBar.updateDocument({
      documentUri: 'file:///workspace/cuts/active.otio',
      sessionId: 'session-active',
      revision: 4,
      name: 'Active Cut',
      durationSeconds: 65,
      trackCount: 3,
      clipCount: 8,
      dirty: true,
    });

    expect(mocks.update).toHaveBeenCalledWith(
      'neko.cut.documentStatus',
      '$(file-media) Active Cut * · 8 Clips',
      expect.stringContaining('Duration: 01:05'),
    );
    expect(mocks.setVisible).toHaveBeenCalledWith('neko.cut.documentStatus', true);

    await statusBar.openCurrentDocument();
    expect(mocks.executeCommand).toHaveBeenCalledWith(
      'vscode.openWith',
      { value: 'file:///workspace/cuts/active.otio' },
      'neko.cut.otioEditor',
    );
  });

  it('hides and clears document navigation when focus leaves Cut', async () => {
    const statusBar = new StatusBar();
    statusBar.updateDocument({
      documentUri: 'file:///workspace/cuts/active.otio',
      sessionId: 'session-active',
      revision: 4,
      name: 'Active Cut',
      durationSeconds: 1,
      trackCount: 1,
      clipCount: 1,
      dirty: false,
    });

    statusBar.updateDocument(undefined);

    expect(mocks.setVisible).toHaveBeenCalledWith('neko.cut.documentStatus', false);
    await expect(statusBar.openCurrentDocument()).rejects.toThrow(
      'No active Cut document is available',
    );
  });
});
