import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveNkv, type ProjectData } from '@neko/shared';
import { VideoEditorModel } from './videoEditorModel';

const applyEditMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock('vscode', () => {
  class EventEmitter<T> {
    private readonly listeners: Array<(event: T) => void> = [];

    readonly event = (listener: (event: T) => void) => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          const index = this.listeners.indexOf(listener);
          if (index >= 0) this.listeners.splice(index, 1);
        },
      };
    };

    fire(event: T): void {
      for (const listener of [...this.listeners]) listener(event);
    }

    dispose(): void {
      this.listeners.length = 0;
    }
  }

  class WorkspaceEdit {
    readonly replacements: Array<{
      readonly uri: unknown;
      readonly range: unknown;
      readonly text: string;
    }> = [];

    replace(uri: unknown, range: unknown, text: string): void {
      this.replacements.push({ uri, range, text });
    }
  }

  return {
    EndOfLine: { LF: 1 },
    EventEmitter,
    Position: class Position {
      constructor(
        readonly line: number,
        readonly character: number,
      ) {}
    },
    Range: class Range {
      constructor(
        readonly startLine: number,
        readonly startCharacter: number,
        readonly endLine: number,
        readonly endCharacter: number,
      ) {}
    },
    Uri: {
      file: (fsPath: string) => ({
        fsPath,
        toString: () => `file://${fsPath}`,
      }),
    },
    WorkspaceEdit,
    workspace: {
      applyEdit: applyEditMock,
    },
    commands: {
      executeCommand: vi.fn(),
    },
  };
});

describe('VideoEditorModel document save contract', () => {
  beforeEach(() => {
    applyEditMock.mockClear();
    applyEditMock.mockResolvedValue(true);
  });

  it('syncs project data into the TextDocument using the canonical NKV codec text', async () => {
    const document = createDocument('/workspace/project/edit.nkv', createProject());
    const model = new VideoEditorModel(document);
    const nextProject = createProject({ name: 'Canonical save text' });

    await model.syncSavedProjectData(nextProject);

    expect(applyEditMock).toHaveBeenCalledOnce();
    const edit = applyEditMock.mock.calls[0]?.[0] as
      | { readonly replacements: readonly [{ readonly text: string }] }
      | undefined;
    expect(edit?.replacements[0]?.text).toBe(`${saveNkv(nextProject)}\n`);
  });

  it('marks exactly one internal TextDocument edit for provider change handling', async () => {
    const document = createDocument('/workspace/project/edit.nkv', createProject());
    const model = new VideoEditorModel(document);

    expect(model.isInternalSave).toBe(false);

    await model.syncSavedProjectData(createProject({ name: 'One internal edit' }));

    expect(model.isInternalSave).toBe(true);
    expect(model.consumeInternalDocumentEdit()).toBe(true);
    expect(model.isInternalSave).toBe(false);
    expect(model.consumeInternalDocumentEdit()).toBe(false);
  });

  it('clears pending document edits after a failed applyEdit attempt', async () => {
    const document = createDocument('/workspace/project/edit.nkv', createProject());
    const model = new VideoEditorModel(document);
    applyEditMock.mockResolvedValue(false);

    await model.syncSavedProjectData(createProject({ name: 'Rejected edit' }));

    await expect(model.awaitPendingDocumentEdit()).resolves.toBeUndefined();
  });

  it('awaits all queued TextDocument syncs before save snapshots run', async () => {
    const document = createMutableDocument('/workspace/project/edit.nkv', createProject());
    const model = new VideoEditorModel(document);
    let releaseFirstEdit: (() => void) | undefined;
    const firstEditStarted = new Promise<void>((resolve) => {
      applyEditMock.mockImplementationOnce(async (edit) => {
        applyWorkspaceEditToDocument(edit, document);
        resolve();
        await new Promise<void>((release) => {
          releaseFirstEdit = release;
        });
        return true;
      });
    });
    applyEditMock.mockImplementationOnce(async (edit) => {
      applyWorkspaceEditToDocument(edit, document);
      return true;
    });

    const firstSync = model.syncSavedProjectData(createProject({ name: 'First queued edit' }));
    await firstEditStarted;
    const secondSync = model.syncSavedProjectData(createProject({ name: 'Second queued edit' }));

    let pendingSettled = false;
    const pending = model.awaitPendingDocumentEdit().then(() => {
      pendingSettled = true;
    });
    await Promise.resolve();

    expect(pendingSettled).toBe(false);
    releaseFirstEdit?.();
    await Promise.all([firstSync, secondSync, pending]);

    expect(document.getText()).toBe(`${saveNkv(createProject({ name: 'Second queued edit' }))}\n`);
  });

  it('does not apply a TextDocument edit when the canonical NKV text is unchanged', async () => {
    const project = createProject({ name: 'Already synced' });
    const document = createDocument('/workspace/project/edit.nkv', project, {
      trailingNewline: true,
    });
    const model = new VideoEditorModel(document);

    await model.syncSavedProjectData(project);

    expect(applyEditMock).not.toHaveBeenCalled();
    expect(model.isInternalSave).toBe(false);
  });
});

function createDocument(
  filePath: string,
  project: ProjectData,
  options: { readonly trailingNewline?: boolean } = {},
) {
  const text = options.trailingNewline ? `${saveNkv(project)}\n` : saveNkv(project);
  return {
    uri: {
      fsPath: filePath,
      toString: () => `file://${filePath}`,
    },
    fileName: filePath,
    isUntitled: false,
    languageId: 'json',
    version: 1,
    isDirty: false,
    isClosed: false,
    eol: 1,
    lineCount: text.split('\n').length,
    save: vi.fn(async () => true),
    getText: () => text,
  } as never;
}

function createMutableDocument(filePath: string, project: ProjectData) {
  let text = saveNkv(project);
  return {
    uri: {
      fsPath: filePath,
      toString: () => `file://${filePath}`,
    },
    fileName: filePath,
    isUntitled: false,
    languageId: 'json',
    version: 1,
    isDirty: false,
    isClosed: false,
    eol: 1,
    get lineCount() {
      return text.split('\n').length;
    },
    save: vi.fn(async () => true),
    getText: () => text,
    setText: (nextText: string) => {
      text = nextText;
    },
  } as never;
}

function applyWorkspaceEditToDocument(edit: unknown, document: unknown): void {
  const nextText = (edit as { readonly replacements?: readonly [{ readonly text: string }] })
    .replacements?.[0]?.text;
  if (typeof nextText === 'string') {
    (document as { setText(nextText: string): void }).setText(nextText);
  }
}

function createProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    version: '2.0',
    name: 'Contract Test',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: 'track-1',
        name: 'Main',
        type: 'media',
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
      },
    ],
    ...overrides,
  };
}
