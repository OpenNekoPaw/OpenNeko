import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  createWorkspaceLinkedMediaLibrary,
  listWorkspaceLinkedMediaLibraries,
  removeWorkspaceLinkedMediaLibrary,
  replaceWorkspaceLinkedMediaLibrary,
} from '@neko/shared/node/workspace-linked-media-libraries';
import type { WorkspaceLinkedMediaLibrary } from '@neko/shared';

export class WorkspaceLinkedMediaLibraryService implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly changeEmitter = new vscode.EventEmitter<
    readonly WorkspaceLinkedMediaLibrary[]
  >();
  readonly onDidChange = this.changeEmitter.event;

  constructor(readonly workspaceRoot: string) {
    const assetsDirectory = path.join(workspaceRoot, 'neko', 'assets');
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(assetsDirectory, '*'),
    );
    const changed = () => void this.fireChanged();
    this.disposables.push(
      watcher,
      watcher.onDidCreate(changed),
      watcher.onDidChange(changed),
      watcher.onDidDelete(changed),
    );
  }

  list(): Promise<readonly WorkspaceLinkedMediaLibrary[]> {
    return listWorkspaceLinkedMediaLibraries(this.workspaceRoot);
  }

  async add(name: string, targetDirectory: string): Promise<WorkspaceLinkedMediaLibrary> {
    const result = await createWorkspaceLinkedMediaLibrary({
      workspaceRoot: this.workspaceRoot,
      name,
      targetDirectory,
    });
    await this.fireChanged();
    return result.library;
  }

  async relink(name: string, targetDirectory: string): Promise<WorkspaceLinkedMediaLibrary> {
    const result = await replaceWorkspaceLinkedMediaLibrary({
      workspaceRoot: this.workspaceRoot,
      name,
      targetDirectory,
    });
    await this.fireChanged();
    return result.library;
  }

  async remove(name: string): Promise<void> {
    await removeWorkspaceLinkedMediaLibrary({ workspaceRoot: this.workspaceRoot, name });
    await this.fireChanged();
  }

  resolveWorkspacePath(workspacePath: string): string {
    return path.join(this.workspaceRoot, ...workspacePath.split('/'));
  }

  dispose(): void {
    this.changeEmitter.dispose();
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }

  private async fireChanged(): Promise<void> {
    this.changeEmitter.fire(await this.list());
  }
}
