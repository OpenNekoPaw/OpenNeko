import * as vscode from 'vscode';
import type { IWorkspaceIO } from '../contracts/IWorkspaceIO';

export class VSCodeWorkspaceIO implements IWorkspaceIO {
  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    return vscode.workspace.fs.readFile(uri);
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    return vscode.workspace.fs.stat(uri);
  }

  async findFiles(globPattern: vscode.GlobPattern): Promise<readonly vscode.Uri[]> {
    return vscode.workspace.findFiles(globPattern);
  }

  createFileSystemWatcher(globPattern: vscode.GlobPattern): vscode.FileSystemWatcher {
    return vscode.workspace.createFileSystemWatcher(globPattern);
  }

  getTextDocuments(): readonly vscode.TextDocument[] {
    return vscode.workspace.textDocuments;
  }

  getVisibleTextEditors(): readonly vscode.TextEditor[] {
    return vscode.window.visibleTextEditors;
  }

  onDidOpenTextDocument(
    listener: (document: vscode.TextDocument) => void | Promise<void>,
  ): vscode.Disposable {
    return vscode.workspace.onDidOpenTextDocument(listener);
  }

  onDidChangeTextDocument(
    listener: (event: vscode.TextDocumentChangeEvent) => void | Promise<void>,
  ): vscode.Disposable {
    return vscode.workspace.onDidChangeTextDocument(listener);
  }

  onDidCloseTextDocument(
    listener: (document: vscode.TextDocument) => void | Promise<void>,
  ): vscode.Disposable {
    return vscode.workspace.onDidCloseTextDocument(listener);
  }
}
