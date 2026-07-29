import type * as vscode from 'vscode';

export interface IWorkspaceIO {
  readFile(uri: vscode.Uri): Promise<Uint8Array>;
  stat(uri: vscode.Uri): Promise<vscode.FileStat>;
  findFiles(globPattern: vscode.GlobPattern): Promise<readonly vscode.Uri[]>;
  createFileSystemWatcher(globPattern: vscode.GlobPattern): vscode.FileSystemWatcher;
  getTextDocuments(): readonly vscode.TextDocument[];
  getVisibleTextEditors(): readonly vscode.TextEditor[];
  onDidOpenTextDocument(
    listener: (document: vscode.TextDocument) => void | Promise<void>,
  ): vscode.Disposable;
  onDidChangeTextDocument(
    listener: (event: vscode.TextDocumentChangeEvent) => void | Promise<void>,
  ): vscode.Disposable;
  onDidCloseTextDocument(
    listener: (document: vscode.TextDocument) => void | Promise<void>,
  ): vscode.Disposable;
}
