import * as vscode from 'vscode';
import { saveNkv, type ProjectData } from '@neko/shared';

export class VideoProjectDocument implements vscode.CustomDocument {
  private _projectData: ProjectData;

  constructor(
    readonly uri: vscode.Uri,
    projectData: ProjectData,
    private readonly onDispose: () => void = () => undefined,
  ) {
    this._projectData = projectData;
  }

  get projectData(): ProjectData {
    return this._projectData;
  }

  setProjectData(projectData: ProjectData): void {
    this._projectData = projectData;
  }

  getText(): string {
    return `${saveNkv(this._projectData)}\n`;
  }

  dispose(): void {
    this.onDispose();
  }
}

export function createVideoProjectTextDocumentAdapter(
  document: VideoProjectDocument,
): vscode.TextDocument {
  return {
    uri: document.uri,
    fileName: document.uri.fsPath,
    isUntitled: false,
    languageId: 'json',
    encoding: 'utf8',
    version: 1,
    isDirty: false,
    isClosed: false,
    eol: vscode.EndOfLine.LF,
    get lineCount() {
      return document.getText().split('\n').length;
    },
    save: async () => {
      await vscode.commands.executeCommand('workbench.action.files.save');
      return true;
    },
    getText: () => document.getText(),
    lineAt: () => {
      throw new Error('VideoProjectDocument adapter does not expose text lines.');
    },
    offsetAt: () => 0,
    positionAt: () => new vscode.Position(0, 0),
    getWordRangeAtPosition: () => undefined,
    validateRange: (range) => range,
    validatePosition: (position) => position,
  } as unknown as vscode.TextDocument;
}
